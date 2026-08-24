'use strict';

const crypto = require('crypto');
const {
    decryptPollVote,
    getKeyAuthor,
    jidNormalizedUser,
} = require('@pasqua-baileys/baileys');
const database = require('../utils/database');

const pendingByPoll = new Map();
const pendingByUser = new Map();
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_PENDING_PER_GROUP = 25;

function normalizeJid(value) {
    if (!value) return '';
    try { return jidNormalizedUser(String(value)); } catch (_) {}
    return String(value).replace(/:\d+(?=@)/, '');
}

function numberPart(jid) {
    return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function sameJid(a, b) {
    const left = normalizeJid(a);
    const right = normalizeJid(b);
    return !!left && !!right && (left === right || numberPart(left) === numberPart(right));
}

function optionHash(option) {
    return crypto.createHash('sha256').update(Buffer.from(String(option))).digest();
}

function selectedValues(vote) {
    return Array.isArray(vote?.selectedOptions) ? vote.selectedOptions : [];
}

function valueBuffer(value) {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
    if (Array.isArray(value)) return Buffer.from(value);
    if (value && Array.isArray(value.data)) return Buffer.from(value.data);
    if (typeof value === 'string') {
        const text = value.trim();
        if (/^[A-Za-z0-9+/]+={0,2}$/.test(text) && text.length % 4 === 0) {
            const decoded = Buffer.from(text, 'base64');
            if (decoded.length === 32) return decoded;
        }
        return null;
    }
    return null;
}

function selectedHashes(vote) {
    return selectedValues(vote)
        .map(valueBuffer)
        .filter(Boolean);
}

function normalizedOption(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function classifySelectedOption(vote, decryptedHashes, entry) {
    const wrongHash = entry.wrongHash;
    if (decryptedHashes.length === 1) {
        if (decryptedHashes[0].equals(entry.correctHash)) return 'correct';
        if (wrongHash && decryptedHashes[0].equals(wrongHash)) return 'incorrect';
    }
    const selected = selectedValues(vote);
    if (selected.length !== 1) return 'unknown';
    const value = selected[0];
    const bytes = valueBuffer(value);
    if (bytes?.equals(entry.correctHash)) return 'correct';
    if (bytes && wrongHash && bytes.equals(wrongHash)) return 'incorrect';
    if (typeof value === 'string') {
        const normalized = normalizedOption(value);
        if (normalized === normalizedOption(entry.correctOption)) return 'correct';
        if (normalized === normalizedOption(entry.wrongOption)) return 'incorrect';
    }
    return 'unknown';
}

function removePending(entry) {
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingByPoll.delete(entry.pollId);
    pendingByUser.delete(`${entry.groupId}:${normalizeJid(entry.userJid)}`);
}

async function removeMember(sock, entry, reason) {
    try {
        const meta = await groupMetadata(sock, entry.groupId);
        if (!botIsAdmin(meta, sock)) throw new Error('bot is not a group admin');
        await sock.groupParticipantsUpdate(entry.groupId, [entry.userJid], 'remove');
        await sock.sendMessage(entry.groupId, {
            text: `${reason}\n\n@${numberPart(entry.userJid)}`,
            mentions: [entry.userJid],
        }).catch(() => {});
    } catch (error) {
        console.error('[GUARD] removal failed:', error.message);
        await sock.sendMessage(entry.groupId, {
            text: `⚠️ Guard could not remove @${numberPart(entry.userJid)}. Make me a group admin.`,
            mentions: [entry.userJid],
        }).catch(() => {});
    }
}

async function expireEntry(sock, entry) {
    if (!entry || !pendingByPoll.has(entry.pollId)) return;
    removePending(entry);
    await removeMember(sock, entry, '🚫 *Guard timeout:* the verification was not completed within 60 seconds.');
}

function participantIdentifiers(participant) {
    return [participant?.id, participant?.jid, participant?.phoneNumber, participant?.lid]
        .filter(Boolean)
        .map(normalizeJid);
}

function botIsAdmin(meta, sock) {
    const bot = normalizeJid(sock.user?.id);
    const botNumber = numberPart(bot);
    return !!meta?.participants?.some(participant => {
        const identifiers = participantIdentifiers(participant);
        return identifiers.some(id => (sameJid(id, bot) || numberPart(id) === botNumber)) && !!participant.admin;
    });
}

function participantIsAdmin(meta, jid) {
    return !!meta?.participants?.some(participant => {
        const identifiers = participantIdentifiers(participant);
        return identifiers.some(id => sameJid(id, jid)) && !!participant.admin;
    });
}

async function groupMetadata(sock, groupId) {
    return sock.groupMetadata(groupId).catch(() => null);
}

async function issueChallenge(sock, groupId, userJid, config) {
    const existingKey = `${groupId}:${normalizeJid(userJid)}`;
    const existing = pendingByUser.get(existingKey);
    if (existing) return;

    const groupPending = [...pendingByPoll.values()].filter(entry => entry.groupId === groupId);
    if (groupPending.length >= MAX_PENDING_PER_GROUP) {
        await sock.sendMessage(groupId, { text: '⚠️ Guard is busy verifying recent members. Please try joining again shortly.' }).catch(() => {});
        return;
    }

    const options = Array.isArray(config.guardOptions) && config.guardOptions.length === 2
        ? config.guardOptions.map(option => String(option).trim())
        : ['I am human', 'I am a robot'];
    const isDefaultHumanChallenge = normalizedOption(options[0]) === 'i am human'
        && normalizedOption(options[1]) === 'i am a robot';
    const correctIndex = isDefaultHumanChallenge ? 0 : Number(config.guardCorrect) === 1 ? 1 : 0;
    const question = String(config.guardQuestion || 'Are you human?').trim().slice(0, 180);
    const mention = `@${numberPart(userJid)}`;
    const pollEncKey = crypto.randomBytes(32);
    let sent;

    try {
        await sock.sendMessage(groupId, {
            text: `🛡️ ${mention} — please answer the verification poll below within 60 seconds.`,
            mentions: [userJid],
        });
        sent = await sock.sendMessage(groupId, {
            poll: {
                name: question,
                values: options,
                selectableCount: 1,
                hideVoter: false,
                canAddOption: false,
                messageSecret: pollEncKey,
            },
        });
    } catch (error) {
        console.error('[GUARD] poll send failed:', error.message);
        return;
    }

    const pollId = sent?.key?.id;
    if (!pollId) return;
    const messageSecret = pollEncKey;
    const entry = {
        groupId,
        userJid,
        pollId,
        pollCreatorJid: normalizeJid(getKeyAuthor(sent?.key, normalizeJid(sock.user?.id)) || sock.user?.id),
        pollCreatorJids: [...new Set([
            getKeyAuthor(sent?.key, normalizeJid(sock.user?.id)),
            sent?.key?.participantAlt,
            sent?.key?.participant,
            sent?.key?.remoteJidAlt,
            sock.user?.id,
        ].filter(Boolean).map(normalizeJid))],
        pollEncKey: messageSecret ? Buffer.from(messageSecret) : null,
        correctHash: optionHash(options[correctIndex]),
        correctOption: options[correctIndex],
        wrongOption: options[correctIndex === 0 ? 1 : 0],
        wrongHash: optionHash(options[correctIndex === 0 ? 1 : 0]),
        expiresAt: Date.now() + DEFAULT_TIMEOUT_MS,
        timer: null,
    };
    entry.timer = setTimeout(() => expireEntry(sock, entry).catch(error => console.error('[GUARD] timeout:', error.message)), DEFAULT_TIMEOUT_MS);
    entry.timer.unref?.();
    pendingByPoll.set(pollId, entry);
    pendingByUser.set(existingKey, entry);
}

async function handleParticipantsUpdate(sock, event) {
    if (!event || !event.id) return;
    if (event.action === 'remove') {
        for (const entry of [...pendingByPoll.values()]) {
            if (entry.groupId !== event.id) continue;
            const removed = (event.participants || []).some(raw => {
                const jid = typeof raw === 'string' ? raw : raw?.id || raw?.jid || raw?.phoneNumber;
                return sameJid(jid, entry.userJid);
            });
            if (removed) removePending(entry);
        }
        return;
    }
    if (event.action !== 'add') return;
    const config = database.getGroup(event.id);
    if (!config.guard) return;

    const meta = await groupMetadata(sock, event.id);
    if (!botIsAdmin(meta, sock)) {
        await sock.sendMessage(event.id, { text: '⚠️ *Guard is enabled,* but I need group-admin rights to verify and remove newcomers.' }).catch(() => {});
        return;
    }

    for (const raw of event.participants || []) {
        const userJid = typeof raw === 'string' ? raw : raw?.id || raw?.jid || raw?.phoneNumber;
        if (!userJid || sameJid(userJid, sock.user?.id) || participantIsAdmin(meta, userJid)) continue;
        await issueChallenge(sock, event.id, userJid, config);
    }
}

function voterCandidates(message) {
    return [message?.key?.participantAlt, message?.key?.remoteJidAlt, message?.key?.participant, message?.key?.remoteJid]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index);
}

async function decryptSelectedOptions(sock, message, entry, vote, voterJids) {
    const direct = selectedHashes(vote);
    if (direct.length || !vote?.encPayload || !vote?.encIv || !entry.pollEncKey) return direct;
    const creators = entry.pollCreatorJids?.length ? entry.pollCreatorJids : [entry.pollCreatorJid];
    const voters = [...new Set([
        getKeyAuthor(message?.key, entry.pollCreatorJid),
        ...(Array.isArray(voterJids) ? voterJids : [voterJids]),
    ].filter(Boolean).map(normalizeJid))];
    for (const pollCreatorJid of creators) {
        for (const voterJid of voters) {
            try {
                const decoded = decryptPollVote(vote, {
                    pollCreatorJid,
                    pollMsgId: entry.pollId,
                    pollEncKey: entry.pollEncKey,
                    voterJid,
                });
                const hashes = selectedHashes(decoded);
                if (hashes.length) return hashes;
            } catch (_) {}
        }
    }
    console.error('[GUARD] poll vote decryption failed for all known JID variants');
    return [];
}

async function handleMessages(sock, batch) {
    if (batch?.type && batch.type !== 'notify') return;
    for (const message of batch?.messages || []) {
        const update = message?.message?.pollUpdateMessage;
        const pollId = update?.pollCreationMessageKey?.id;
        if (!pollId) continue;
        const entry = pendingByPoll.get(pollId);
        if (!entry || Date.now() > entry.expiresAt) continue;
        const voter = voterCandidates(message).find(candidate => sameJid(candidate, entry.userJid));
        if (!voter) continue;

        const hashes = await decryptSelectedOptions(sock, message, entry, update.vote, voterCandidates(message));
        const outcome = classifySelectedOption(update.vote, hashes, entry);
        if (outcome === 'unknown') {
            if (!entry.ambiguousVoteNotified) {
                entry.ambiguousVoteNotified = true;
                await sock.sendMessage(entry.groupId, {
                    text: `⚠️ I could not read that vote reliably. @${numberPart(entry.userJid)}, please select *${entry.correctOption}* again before the 60-second deadline.`,
                    mentions: [entry.userJid],
                }).catch(() => {});
            }
            continue;
        }
        removePending(entry);
        if (outcome === 'correct') {
            await sock.sendMessage(entry.groupId, {
                text: `✅ *The user is verified:* @${numberPart(entry.userJid)} is allowed to stay in the group.`,
                mentions: [entry.userJid],
            }).catch(() => {});
        } else {
            await removeMember(sock, entry, '🚫 *Guard failed:* the selected answer was incorrect.');
        }
    }
}

function setupGuard(sock) {
    if (!sock?.ev?.on || sock.__sukunaGuardReady) return;
    sock.__sukunaGuardReady = true;
    sock.ev.on('group-participants.update', event => {
        handleParticipantsUpdate(sock, event).catch(error => console.error('[GUARD] participant event:', error.message));
    });
    sock.ev.on('messages.upsert', batch => {
        handleMessages(sock, batch).catch(error => console.error('[GUARD] message event:', error.message));
    });
}

module.exports = { setupGuard, handleParticipantsUpdate, handleMessages };

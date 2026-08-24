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

function voteContent(vote) {
    return vote?.pollVoteMessage || vote?.vote || vote || {};
}

function selectedValues(vote) {
    const content = voteContent(vote);
    return Array.isArray(content?.selectedOptions) ? content.selectedOptions : [];
}

function bytes(value) {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
    if (Array.isArray(value)) return Buffer.from(value);
    if (value && Array.isArray(value.data)) return Buffer.from(value.data);
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, 'hex');
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(text) && text.length % 4 === 0) {
        try { return Buffer.from(text, 'base64'); } catch (_) { return null; }
    }
    return null;
}

function valueBuffer(value) {
    const result = bytes(value);
    return result?.length === 32 ? result : null;
}

function selectedHashes(vote) {
    return selectedValues(vote).map(valueBuffer).filter(Boolean);
}

function normalizedOption(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function classifySelectedOption(vote, decryptedHashes, entry) {
    const correctHash = entry.correctHash;
    const wrongHash = entry.wrongHash;
    if (decryptedHashes.length === 1) {
        if (decryptedHashes[0].equals(correctHash)) return 'correct';
        if (wrongHash && decryptedHashes[0].equals(wrongHash)) return 'incorrect';
    }
    const selected = selectedValues(vote);
    if (selected.length !== 1) return 'unknown';
    const value = selected[0];
    const hash = valueBuffer(value);
    if (hash?.equals(correctHash)) return 'correct';
    if (hash && wrongHash && hash.equals(wrongHash)) return 'incorrect';
    if (typeof value === 'string') {
        const normalized = normalizedOption(value);
        if (normalized === normalizedOption(entry.correctOption)) return 'correct';
        if (normalized === normalizedOption(entry.wrongOption)) return 'incorrect';
    }
    return 'unknown';
}

function unwrapContent(message) {
    let content = message?.message || {};
    for (let i = 0; i < 5; i += 1) {
        const next = content?.ephemeralMessage?.message
            || content?.viewOnceMessage?.message
            || content?.viewOnceMessageV2?.message
            || content?.viewOnceMessageV2Extension?.message
            || content?.documentWithCaptionMessage?.message;
        if (!next) break;
        content = next;
    }
    return content || {};
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

    let options = Array.isArray(config.guardOptions) && config.guardOptions.length === 2
        ? config.guardOptions.map(option => String(option).trim())
        : ['I am human', 'I am a robot'];
    if (!options[0] || !options[1] || normalizedOption(options[0]) === normalizedOption(options[1])) {
        options = ['I am human', 'I am a robot'];
    }
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
    const creator = normalizeJid(sock.user?.id);
    const creatorFromKey = getKeyAuthor(sent?.key, creator);
    const creatorJids = [...new Set([
        creatorFromKey,
        sent?.key?.participantAlt,
        sent?.key?.participant,
        sent?.key?.remoteJidAlt,
        creator,
    ].filter(Boolean).map(normalizeJid))];
    const entry = {
        groupId,
        userJid,
        pollId,
        pollKey: sent.key,
        pollCreatorJid: normalizeJid(creatorFromKey || creator),
        pollCreatorJids: creatorJids,
        pollEncKey: Buffer.from(pollEncKey),
        correctHash: optionHash(options[correctIndex]),
        correctOption: options[correctIndex],
        wrongOption: options[correctIndex === 0 ? 1 : 0],
        wrongHash: optionHash(options[correctIndex === 0 ? 1 : 0]),
        expiresAt: Date.now() + DEFAULT_TIMEOUT_MS,
        timer: null,
        processing: false,
        seenVoteKeys: new Set(),
        ambiguousVoteNotified: false,
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

function voterCandidates(messageOrKey) {
    const key = messageOrKey?.key || messageOrKey || {};
    return [key.participantAlt, key.remoteJidAlt, key.participant, key.remoteJid]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index);
}

function byteFields(vote) {
    const content = voteContent(vote);
    return { encPayload: bytes(content?.encPayload), encIv: bytes(content?.encIv) };
}

async function decryptSelectedOptions(message, entry, vote, voterJids) {
    const direct = selectedHashes(vote);
    if (direct.length) return { hashes: direct, confident: true };

    const { encPayload, encIv } = byteFields(vote);
    if (!encPayload || !encIv || !entry.pollEncKey) return { hashes: [], confident: false };

    const key = message?.key || message || {};
    const canonicalVoter = getKeyAuthor(key, entry.pollCreatorJid);
    const creators = entry.pollCreatorJids?.length ? entry.pollCreatorJids : [entry.pollCreatorJid];
    const voters = [...new Set([
        canonicalVoter,
        ...(Array.isArray(voterJids) ? voterJids : [voterJids]),
    ].filter(Boolean).map(normalizeJid))];
    const results = new Map();

    for (const pollCreatorJid of creators) {
        for (const voterJid of voters) {
            try {
                const decoded = decryptPollVote({ encPayload, encIv }, {
                    pollCreatorJid,
                    pollMsgId: entry.pollId,
                    pollEncKey: entry.pollEncKey,
                    voterJid,
                });
                const hashes = selectedHashes(decoded);
                if (hashes.length) results.set(hashes.map(hash => hash.toString('hex')).join(','), hashes);
            } catch (_) {}
        }
    }

    if (results.size !== 1) {
        if (results.size > 1) console.error('[GUARD] poll vote had conflicting identity decryptions');
        return { hashes: [], confident: false };
    }
    return { hashes: [...results.values()][0], confident: true };
}

async function processVote(sock, entry, message, update, vote, alreadyDecrypted = false) {
    if (!entry || !pendingByPoll.has(entry.pollId) || Date.now() > entry.expiresAt || entry.processing) return;
    const voterKey = update?.pollUpdateMessageKey || message?.key || message;
    const voter = voterCandidates(voterKey).find(candidate => sameJid(candidate, entry.userJid));
    if (!voter) return;

    const voteKey = update?.pollUpdateMessageKey?.id || message?.key?.id || `${entry.pollId}:${voter}`;
    if (entry.seenVoteKeys.has(voteKey)) return;
    entry.seenVoteKeys.add(voteKey);
    entry.processing = true;

    let result;
    try {
        result = alreadyDecrypted
            ? { hashes: selectedHashes(vote), confident: selectedHashes(vote).length > 0 }
            : await decryptSelectedOptions(message, entry, vote, voterCandidates(voterKey));
    } finally {
        entry.processing = false;
    }

    const outcome = result.confident ? classifySelectedOption(vote, result.hashes, entry) : 'unknown';
    if (outcome === 'unknown') {
        if (!entry.ambiguousVoteNotified) {
            entry.ambiguousVoteNotified = true;
            await sock.sendMessage(entry.groupId, {
                text: `⚠️ I could not read that vote reliably. @${numberPart(entry.userJid)}, please select *${entry.correctOption}* again before the 60-second deadline.`,
                mentions: [entry.userJid],
            }).catch(() => {});
        }
        return;
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

function messagePollUpdate(message) {
    const content = unwrapContent(message);
    return content?.pollUpdateMessage || null;
}

async function handleMessages(sock, batch) {
    if (batch?.type && batch.type !== 'notify') return;
    for (const message of batch?.messages || []) {
        const update = messagePollUpdate(message);
        const pollId = update?.pollCreationMessageKey?.id;
        if (!pollId) continue;
        const entry = pendingByPoll.get(pollId);
        if (!entry) continue;
        await processVote(sock, entry, message, update, update.vote, false);
    }
}

async function handleMessagesUpdate(sock, updates) {
    const list = Array.isArray(updates) ? updates : [updates];
    for (const item of list) {
        const outerKey = item?.key || {};
        const pollUpdates = item?.update?.pollUpdates || item?.pollUpdates || [];
        for (const update of pollUpdates) {
            const pollId = outerKey.id || update?.pollCreationMessageKey?.id;
            const entry = pendingByPoll.get(pollId);
            if (!entry) continue;
            const voterKey = update?.pollUpdateMessageKey || {};
            await processVote(sock, entry, { key: voterKey }, update, update.vote, true);
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
    sock.ev.on('messages.update', updates => {
        handleMessagesUpdate(sock, updates).catch(error => console.error('[GUARD] decrypted poll update:', error.message));
    });
}

module.exports = {
    setupGuard,
    handleParticipantsUpdate,
    handleMessages,
    handleMessagesUpdate,
    classifySelectedOption,
    optionHash,
};

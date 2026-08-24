'use strict';

const fs = require('fs');
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

function rawJid(value) {
    return value == null ? '' : String(value).trim();
}

function normalizeJid(value) {
    const raw = rawJid(value);
    if (!raw) return '';
    try { return jidNormalizedUser(raw); } catch (_) {}
    return raw.replace(/:\d+(?=@)/, '');
}

// Poll crypto signs the exact JID returned by Baileys' getKeyAuthor. Keep the
// wire value first, then add a normalized form for linked-device/LID matching.
function jidCandidates(values) {
    const result = [];
    const seen = new Set();
    const add = value => {
        const raw = rawJid(value);
        if (!raw || seen.has(raw)) return;
        seen.add(raw);
        result.push(raw);
    };
    for (const value of Array.isArray(values) ? values : [values]) {
        add(value);
        add(normalizeJid(value));
    }
    return result;
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
    const selected = content?.selectedOptions;
    if (Array.isArray(selected)) return selected;
    if (selected instanceof Uint8Array || selected instanceof ArrayBuffer || typeof selected === 'string') {
        return [selected];
    }
    return [];
}

function bytes(value) {
    if (Buffer.isBuffer(value)) return Buffer.from(value);
    if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer) return Buffer.from(value);
    if (Array.isArray(value)) return Buffer.from(value);
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
    if (value && Array.isArray(value.data)) return Buffer.from(value.data);
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, 'hex');
    if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) {
        try {
            const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
            return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
        } catch (_) { return null; }
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
        .map(rawJid)
        .filter(Boolean);
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
    const requestedPollEncKey = crypto.randomBytes(32);
    let sent;

    try {
        await sock.sendMessage(groupId, {
            text: `🛡️ ${mention} — please answer the verification poll below within 60 seconds. If WhatsApp does not register your selection, reply with *${options[correctIndex]}* before the deadline.`,
            mentions: [userJid],
        });
        sent = await sock.sendMessage(groupId, {
            poll: {
                name: question,
                values: options,
                selectableCount: 1,
                hideVoter: false,
                canAddOption: false,
                messageSecret: requestedPollEncKey,
            },
        });
    } catch (error) {
        console.error('[GUARD] poll send failed:', error.message);
        return;
    }

    const pollId = sent?.key?.id;
    if (!pollId) return;
    const returnedPollEncKey = bytes(sent?.message?.messageContextInfo?.messageSecret);
    const pollEncKey = returnedPollEncKey?.length === 32 ? returnedPollEncKey : requestedPollEncKey;
    const creator = normalizeJid(sock.user?.id);
    const creatorFromKey = getKeyAuthor(sent?.key, creator);
    const creatorJids = jidCandidates([
        creatorFromKey,
        sent?.key?.participantAlt,
        sent?.key?.participant,
        sent?.key?.remoteJidAlt,
        creator,
        sock.user?.id,
        sock.user?.lid,
        sock.user?.jid,
        sock.user?.phoneNumber,
    ]);
    const entry = {
        groupId,
        userJid,
        pollId,
        pollKey: sent.key,
        // Keep the exact author first; the fork signs this string byte-for-byte.
        pollCreatorJid: rawJid(creatorFromKey || creator),
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
    return jidCandidates([key.participantAlt, key.remoteJidAlt, key.participant, key.remoteJid]);
}

function byteFields(vote) {
    const content = voteContent(vote);
    return { encPayload: bytes(content?.encPayload), encIv: bytes(content?.encIv) };
}

function safeWireShape(value) {
    if (Buffer.isBuffer(value)) return { type: 'Buffer', bytes: value.length };
    if (value instanceof Uint8Array) return { type: value.constructor?.name || 'Uint8Array', bytes: value.byteLength };
    if (value instanceof ArrayBuffer) return { type: 'ArrayBuffer', bytes: value.byteLength };
    if (Array.isArray(value)) return { type: 'Array', items: value.length };
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) return { type: 'Buffer-like', bytes: value.data.length };
    if (typeof value === 'string') return { type: 'string', chars: value.length };
    if (value == null) return { type: 'missing' };
    return { type: value.constructor?.name || typeof value };
}

function safeJidClass(value) {
    const raw = rawJid(value);
    const at = raw.lastIndexOf('@');
    const rawServer = at >= 0 ? raw.slice(at + 1) : 'none';
    const server = ['lid', 's.whatsapp.net'].includes(rawServer) ? rawServer : 'other';
    return {
        server,
        hasDevice: at >= 0 && raw.slice(0, at).includes(':'),
    };
}

function recordPollDebug(debug) {
    const text = JSON.stringify(debug, null, 2);
    console.error('[GUARD][poll-debug]', text);
    try {
        fs.writeFileSync('/tmp/guard-poll-debug.json', `${text}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch (_) {}
}

function safePollDebug(route, message, update, vote, entry, voters, attempts, results) {
    const content = voteContent(vote);
    const key = message?.key || message || {};
    return {
        route,
        pollKeyFields: Object.keys(update || {}).sort(),
        messageKeyFields: Object.keys(key || {}).sort(),
        voteFields: Object.keys(content || {}).sort(),
        encrypted: {
            encPayload: safeWireShape(content?.encPayload),
            encIv: safeWireShape(content?.encIv),
        },
        selectedOptions: safeWireShape(content?.selectedOptions),
        voterCandidates: voters.map(safeJidClass),
        creatorCandidates: (entry.pollCreatorJids || []).map(safeJidClass),
        decryptAttempts: attempts,
        decodedResults: results,
    };
}

async function decryptSelectedOptions(message, entry, vote, voterJids, route = 'messages.upsert') {
    const direct = selectedHashes(vote);
    if (direct.length) return { hashes: direct, confident: true, debug: null };

    const { encPayload, encIv } = byteFields(vote);
    if (!encPayload || !encIv || !entry.pollEncKey) {
        return {
            hashes: [],
            confident: false,
            debug: safePollDebug(route, message, messagePollUpdate(message), vote, entry, [], [], []),
        };
    }

    const key = message?.key || message || {};
    const canonicalVoter = getKeyAuthor(key, entry.pollCreatorJid);
    const creators = entry.pollCreatorJids?.length ? entry.pollCreatorJids : [entry.pollCreatorJid];
    const voters = jidCandidates([
        canonicalVoter,
        ...(Array.isArray(voterJids) ? voterJids : [voterJids]),
    ]);
    const results = new Map();
    const attempts = [];

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
                attempts.push({ creator: safeJidClass(pollCreatorJid), voter: safeJidClass(voterJid), decoded: hashes.length > 0 });
                if (hashes.length) {
                    const key = hashes.map(hash => hash.toString('hex')).join(',');
                    results.set(key, hashes);
                }
            } catch (_) {
                attempts.push({ creator: safeJidClass(pollCreatorJid), voter: safeJidClass(voterJid), decoded: false });
            }
        }
    }

    const decodedResults = [...results.keys()].map(value => value.split(',').map(hash => hash.slice(0, 12)));
    const debug = safePollDebug(route, message, messagePollUpdate(message), vote, entry, voters, attempts, decodedResults);
    if (results.size !== 1) {
        if (results.size > 1) console.error('[GUARD] poll vote had conflicting identity decryptions');
        return { hashes: [], confident: false, debug };
    }
    return { hashes: [...results.values()][0], confident: true, debug };
}

async function processVote(sock, entry, message, update, vote, alreadyDecrypted = false, route = 'messages.upsert') {
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
            ? { hashes: selectedHashes(vote), confident: selectedHashes(vote).length > 0, debug: null }
            : await decryptSelectedOptions(message, entry, vote, voterCandidates(voterKey), route);
    } finally {
        entry.processing = false;
    }

    const outcome = result.confident ? classifySelectedOption(vote, result.hashes, entry) : 'unknown';
    if (outcome === 'unknown') {
        if (!result.debug) {
            result.debug = safePollDebug(route, message, update, vote, entry, voterCandidates(voterKey), [], []);
        }
        if (!entry.ambiguousVoteNotified) {
            entry.ambiguousVoteNotified = true;
            recordPollDebug(result.debug);
            await sock.sendMessage(entry.groupId, {
                text: `⚠️ I could not read that vote reliably. @${numberPart(entry.userJid)}, please select *${entry.correctOption}* again or reply with *${entry.correctOption}* before the 60-second deadline.`,
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

function messageText(message) {
    const content = unwrapContent(message);
    return content?.conversation
        || content?.extendedTextMessage?.text
        || content?.buttonsResponseMessage?.selectedDisplayText
        || content?.buttonsResponseMessage?.selectedButtonId
        || content?.listResponseMessage?.title
        || content?.listResponseMessage?.singleSelectReply?.selectedRowId
        || content?.templateButtonReplyMessage?.selectedDisplayText
        || content?.templateButtonReplyMessage?.selectedId
        || '';
}

async function processTextReply(sock, entry, message, text) {
    if (!entry || !pendingByPoll.has(entry.pollId) || Date.now() > entry.expiresAt || entry.processing) return;
    const voter = voterCandidates(message).find(candidate => sameJid(candidate, entry.userJid));
    if (!voter) return;
    const normalized = normalizedOption(text);
    let outcome = 'unknown';
    if (normalized === normalizedOption(entry.correctOption)) outcome = 'correct';
    else if (normalized === normalizedOption(entry.wrongOption)) outcome = 'incorrect';
    if (outcome === 'unknown') return;

    removePending(entry);
    if (outcome === 'correct') {
        await sock.sendMessage(entry.groupId, {
            text: `✅ *The user is verified:* @${numberPart(entry.userJid)} is allowed to stay in the group.`,
            mentions: [entry.userJid],
        }).catch(() => {});
    } else {
        await removeMember(sock, entry, '🚫 *Guard failed:* the reply was incorrect.');
    }
}

async function handleMessages(sock, batch) {
    if (batch?.type && batch.type !== 'notify') return;
    for (const message of batch?.messages || []) {
        const update = messagePollUpdate(message);
        const pollId = update?.pollCreationMessageKey?.id;
        if (pollId) {
            const entry = pendingByPoll.get(pollId);
            if (entry) await processVote(sock, entry, message, update, update.vote, false, 'messages.upsert');
            continue;
        }
        const text = messageText(message);
        if (!text) continue;
        for (const entry of pendingByPoll.values()) {
            if (entry.groupId === message?.key?.remoteJid) {
                await processTextReply(sock, entry, message, text);
            }
        }
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
            await processVote(sock, entry, { key: voterKey }, update, update.vote, true, 'messages.update');
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

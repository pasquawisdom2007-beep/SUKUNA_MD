'use strict';

const database = require('./database');

const MAX_DEPTH = 18;
const MAX_NODES = 6000;
const MAX_KEYS_PER_OBJECT = 160;
const MAX_ARRAY_ITEMS = 1200;
const MAX_STRING_BYTES = 256 * 1024;
const MAX_BINARY_BYTES = 8 * 1024 * 1024;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 35;
const NOTICE_COOLDOWN_MS = 60_000;
const REPORT_COOLDOWN_MS = 60_000;
const rateBuckets = new Map();
const notices = new Map();
const reports = new Map();

function byteLength(value) {
    return Buffer.byteLength(String(value), 'utf8');
}

function isBinary(value) {
    return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

function inspectValue(value, state, path = '$', depth = 0) {
    if (state.nodes++ > MAX_NODES) return `message structure exceeds ${MAX_NODES} nodes`;
    if (depth > MAX_DEPTH) return `message nesting exceeds ${MAX_DEPTH} levels`;
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return null;
    if (typeof value === 'bigint') return null;

    if (typeof value === 'string') {
        if (byteLength(value) > MAX_STRING_BYTES) return `oversized string at ${path}`;
        if (/<\s*(?:script|iframe|object|embed|svg)\b|javascript\s*:|data\s*:\s*text\/html|\bon(?:error|load|click)\s*=/i.test(value)) {
            return `active HTML/script marker at ${path}`;
        }
        const invisibleCount = (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g) || []).length;
        if (invisibleCount > 64) return `excessive invisible/control characters at ${path}`;
        return null;
    }

    if (isBinary(value)) {
        if (value.byteLength > MAX_BINARY_BYTES) return `oversized binary field at ${path}`;
        return null;
    }

    if (typeof value !== 'object') return `unsupported value type at ${path}`;
    if (state.seen.has(value)) return null;
    state.seen.add(value);

    if (Array.isArray(value)) {
        if (value.length > MAX_ARRAY_ITEMS) return `oversized array at ${path}`;
        for (let i = 0; i < value.length; i += 1) {
            const issue = inspectValue(value[i], state, `${path}[${i}]`, depth + 1);
            if (issue) return issue;
        }
        return null;
    }

    let keys;
    try { keys = Object.keys(value); } catch (_) { return `unreadable object at ${path}`; }
    if (keys.length > MAX_KEYS_PER_OBJECT) return `oversized object at ${path}`;
    for (const key of keys) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
            return `unsafe object key at ${path}`;
        }
        const issue = inspectValue(value[key], state, `${path}.${key}`, depth + 1);
        if (issue) return issue;
    }
    return null;
}

function inspectMessage(message) {
    if (!message || typeof message !== 'object') return { suspicious: true, reason: 'message is not an object' };
    if (!message.key || typeof message.key !== 'object') return { suspicious: true, reason: 'message key is missing' };
    if (!message.message || typeof message.message !== 'object') return { suspicious: false, reason: null };
    const state = { nodes: 0, seen: new WeakSet() };
    const reason = inspectValue(message.message, state, '$.message');
    return { suspicious: Boolean(reason), reason, nodes: state.nodes };
}

function sourceFor(message) {
    return message?.key?.participant || message?.key?.participantAlt || message?.participant || message?.key?.remoteJid || 'unknown';
}

function rateCheck(chatId, sender) {
    const now = Date.now();
    const key = `${chatId}:${sender}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) {
        bucket = { startedAt: now, count: 0 };
        rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    while (rateBuckets.size > 4000) rateBuckets.delete(rateBuckets.keys().next().value);
    return bucket.count > RATE_LIMIT;
}

function canNotify(chatId) {
    const now = Date.now();
    const previous = notices.get(chatId) || 0;
    if (now - previous < NOTICE_COOLDOWN_MS) return false;
    notices.set(chatId, now);
    while (notices.size > 1000) notices.delete(notices.keys().next().value);
    return true;
}

function canReport(key) {
    const now = Date.now();
    const previous = reports.get(key) || 0;
    if (now - previous < REPORT_COOLDOWN_MS) return false;
    reports.set(key, now);
    while (reports.size > 2000) reports.delete(reports.keys().next().value);
    return true;
}

function timestampNumber(value) {
    if (value == null) return Math.floor(Date.now() / 1000);
    if (typeof value?.toNumber === 'function') return value.toNumber();
    if (typeof value === 'object' && value.low != null) return Number(value.low);
    const number = Number(value);
    return Number.isFinite(number) ? number : Math.floor(Date.now() / 1000);
}

/**
 * Remove the message from this bot's local chat view only. This deliberately
 * does not send a revoke/delete-for-everyone protocol message.
 */
async function deleteForBotOnly(sock, message) {
    const key = message?.key;
    if (!key?.id || !key.remoteJid || typeof sock?.chatModify !== 'function') return false;
    try {
        await sock.chatModify({
            deleteForMe: {
                key: {
                    remoteJid: key.remoteJid,
                    fromMe: Boolean(key.fromMe),
                    id: key.id,
                    ...(key.participant ? { participant: key.participant } : {}),
                    ...(key.participantAlt ? { participantAlt: key.participantAlt } : {}),
                },
                timestamp: timestampNumber(message.messageTimestamp),
                deleteMedia: true,
            },
        }, key.remoteJid);
        return true;
    } catch (error) {
        console.warn('[ANTIBUG] could not remove suspicious message from bot view:', error.message);
        return false;
    }
}

async function clearChatForBotOnly(sock, message) {
    const key = message?.key;
    if (!key?.id || !key.remoteJid || typeof sock?.chatModify !== 'function') return false;
    try {
        await sock.chatModify({
            clear: {
                lastMessages: [{
                    key: {
                        remoteJid: key.remoteJid,
                        fromMe: Boolean(key.fromMe),
                        id: key.id,
                        ...(key.participant ? { participant: key.participant } : {}),
                    },
                    messageTimestamp: timestampNumber(message.messageTimestamp),
                }],
            },
        }, key.remoteJid);
        return true;
    } catch (error) {
        console.warn('[ANTIBUG] could not clear the bot-local chat view:', error.message);
        return false;
    }
}

async function reportToOwner(sock, ownerJid, phoneNumber, message, reason, flooded, localDeleted, chatCleared) {
    if (!ownerJid || typeof sock?.sendMessage !== 'function') return false;
    const chat = message?.key?.remoteJid || 'unknown';
    const reportKey = `${phoneNumber || ownerJid}:${chat}`;
    if (!canReport(reportKey)) return false;
    const scope = chat.endsWith('@g.us') ? 'group' : 'personal DM';
    const sender = sourceFor(message);
    const text = [
        '🛡️ *AntiBug security report*',
        '',
        `Scope: *${scope}*`,
        `Chat: ${chat}`,
        `Sender: ${sender}`,
        `Reason: ${reason}`,
        `Flood detected: ${flooded ? 'yes' : 'no'}`,
        `Removed from bot view: ${localDeleted ? 'yes' : 'no'}`,
        `Chat cleared locally: ${chatCleared ? 'yes' : 'no'}`,
        '',
        '_Payload content was not copied, executed, decoded, or forwarded._',
    ].join('\n');
    try {
        await sock.sendMessage(ownerJid, { text });
        return true;
    } catch (error) {
        console.warn('[ANTIBUG] owner report failed:', error.message);
        return false;
    }
}

async function screenIncoming(sock, message, options = {}) {
    const from = message?.key?.remoteJid || '';
    if (!from || message?.key?.fromMe) return { blocked: false };

    const structural = inspectMessage(message);
    const isGroup = from.endsWith('@g.us');
    const sender = sourceFor(message);
    const flooded = rateCheck(from, sender);
    const suspicious = structural.suspicious || flooded;
    if (!suspicious) return { blocked: false, structural };

    const group = isGroup ? database.getGroup(from) : {};
    const enabled = isGroup
        ? group.antibug !== false
        : options.personalEnabled === true;
    if (!enabled) return { blocked: false, suspicious: true, structural, flooded, disabled: true };

    const reason = flooded ? 'message rate exceeded' : structural.reason || 'malformed message structure';
    const deletedForMe = await deleteForBotOnly(sock, message);
    // On a burst, clear the local chat range as a second containment step.
    // This never sends a delete-for-everyone/revoke operation.
    const chatCleared = flooded ? await clearChatForBotOnly(sock, message) : false;
    const reported = await reportToOwner(
        sock,
        options.ownerJid,
        options.phoneNumber,
        message,
        reason,
        flooded,
        deletedForMe,
        chatCleared
    );

    if (isGroup && canNotify(from)) {
        await sock.sendMessage(from, {
            text: `🛡️ *AntiBug blocked a suspicious message.*${deletedForMe ? ' It was removed from the bot view only.' : ''}\nReason: ${reason}\n\nThis protection does not delete messages for other group members or inspect/execute payload content.`,
        }).catch(() => {});
    }
    return {
        blocked: true,
        suspicious: true,
        structural,
        flooded,
        deleted: deletedForMe,
        deletedForMe,
        chatCleared,
        reported,
        reason,
    };
}

function clearRuntimeState() {
    rateBuckets.clear();
    notices.clear();
    reports.clear();
}

module.exports = {
    inspectMessage,
    screenIncoming,
    clearRuntimeState,
    limits: {
        MAX_DEPTH,
        MAX_NODES,
        MAX_KEYS_PER_OBJECT,
        MAX_ARRAY_ITEMS,
        MAX_STRING_BYTES,
        MAX_BINARY_BYTES,
        RATE_WINDOW_MS,
        RATE_LIMIT,
    },
};

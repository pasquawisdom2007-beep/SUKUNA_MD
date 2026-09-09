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
const rateBuckets = new Map();
const notices = new Map();

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

function rateCheck(groupId, sender) {
    const now = Date.now();
    const key = `${groupId}:${sender}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) {
        bucket = { startedAt: now, count: 0 };
        rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    while (rateBuckets.size > 4000) rateBuckets.delete(rateBuckets.keys().next().value);
    return bucket.count > RATE_LIMIT;
}

function canNotify(groupId) {
    const now = Date.now();
    const previous = notices.get(groupId) || 0;
    if (now - previous < NOTICE_COOLDOWN_MS) return false;
    notices.set(groupId, now);
    while (notices.size > 1000) notices.delete(notices.keys().next().value);
    return true;
}

async function deleteIncoming(sock, message) {
    const key = message?.key;
    if (!key?.id || !key.remoteJid?.endsWith('@g.us')) return false;
    try {
        await sock.sendMessage(key.remoteJid, {
            delete: {
                remoteJid: key.remoteJid,
                fromMe: Boolean(key.fromMe),
                id: key.id,
                participant: key.participant || key.participantAlt,
            },
        });
        return true;
    } catch (error) {
        console.warn('[ANTIBUG] could not delete suspicious message:', error.message);
        return false;
    }
}

async function screenIncoming(sock, message) {
    const from = message?.key?.remoteJid || '';
    if (!from || message?.key?.fromMe) return { blocked: false };

    const structural = inspectMessage(message);
    const isGroup = from.endsWith('@g.us');
    const sender = sourceFor(message);
    const flooded = isGroup && rateCheck(from, sender);
    const suspicious = structural.suspicious || flooded;
    if (!suspicious) return { blocked: false, structural };

    const group = isGroup ? database.getGroup(from) : {};
    const enabled = isGroup ? group.antibug !== false : true;
    if (!enabled) return { blocked: false, suspicious: true, structural, flooded, disabled: true };

    const reason = flooded ? 'message rate exceeded' : structural.reason || 'malformed message structure';
    const deleted = isGroup ? await deleteIncoming(sock, message) : false;
    if (isGroup && canNotify(from)) {
        await sock.sendMessage(from, {
            text: `🛡️ *AntiBug blocked a suspicious message.*${deleted ? ' It was deleted.' : ''}\nReason: ${reason}\n\nThis protection screens malformed structure and message floods; it does not inspect or execute payload content.`,
        }).catch(() => {});
    }
    return { blocked: true, suspicious: true, structural, flooded, deleted, reason };
}

function clearRuntimeState() {
    rateBuckets.clear();
    notices.clear();
}

module.exports = {
    inspectMessage,
    screenIncoming,
    clearRuntimeState,
    limits: { MAX_DEPTH, MAX_NODES, MAX_KEYS_PER_OBJECT, MAX_ARRAY_ITEMS, MAX_STRING_BYTES, MAX_BINARY_BYTES, RATE_WINDOW_MS, RATE_LIMIT },
};

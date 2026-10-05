'use strict';

const database = require('./database');

// These are deliberately conservative parser/resource ceilings. The goal is to
// reject pathological input before media, rich-message, or command code sees it.
const MAX_DEPTH = 18;
const MAX_NODES = 6000;
const MAX_KEYS_PER_OBJECT = 160;
const MAX_ARRAY_ITEMS = 1200;
const MAX_STRING_BYTES = 256 * 1024;
const MAX_BINARY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_MESSAGE_TYPES = 24;
const MAX_JID_BYTES = 160;
const MAX_MENTIONS = 64;
const MAX_NATIVE_FLOW_BUTTONS = 20;
const MAX_STICKER_PACK_ITEMS = 100;
const MAX_EMBEDDED_JSON_BYTES = 64 * 1024;
const MAX_MEDIA_DECLARED_BYTES = 128 * 1024 * 1024;
const MAX_MEDIA_SECONDS = 24 * 60 * 60;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 35;
const QUARANTINE_MS = 30_000;
const CONTAINMENT_TIMEOUT_MS = 2500;
const REPORT_COOLDOWN_MS = 60_000;
const rateBuckets = new Map();
const quarantines = new Map();
const reports = new Map();
let activeContainments = 0;
const MAX_ACTIVE_CONTAINMENTS = 16;

function byteLength(value) { return Buffer.byteLength(String(value), 'utf8'); }
function isBinary(value) { return Buffer.isBuffer(value) || value instanceof Uint8Array; }
function trimMap(map, max) { while (map.size > max) map.delete(map.keys().next().value); }

function safeEmbeddedJson(value, path) {
    if (typeof value !== 'string') return null;
    if (byteLength(value) > MAX_EMBEDDED_JSON_BYTES) return `oversized embedded JSON at ${path}`;
    const trimmed = value.trim();
    if (!trimmed || !/^[\[{]/.test(trimmed)) return null;
    try {
        JSON.parse(trimmed);
    } catch (_) {
        return `malformed embedded JSON at ${path}`;
    }
    return null;
}

function inspectValue(value, state, path = '$', depth = 0) {
    if (state.nodes++ > MAX_NODES) return `message structure exceeds ${MAX_NODES} nodes`;
    if (depth > MAX_DEPTH) return `message nesting exceeds ${MAX_DEPTH} levels`;
    if (value == null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') return null;

    if (typeof value === 'string') {
        const bytes = byteLength(value);
        state.bytes += bytes;
        if (bytes > MAX_STRING_BYTES) return `oversized string at ${path}`;
        if (state.bytes > MAX_TOTAL_BYTES) return `message exceeds ${MAX_TOTAL_BYTES} bytes`;
        if (/<\s*(?:script|iframe|object|embed|svg|style)\b|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|\bon(?:error|load|click|mouseover)\s*=/i.test(value)) {
            return `active HTML/script marker at ${path}`;
        }
        const invisibleCount = (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g) || []).length;
        if (invisibleCount > 64) return `excessive invisible/control characters at ${path}`;
        // Rich-message JSON is parsed only by the command layer; reject it when
        // it is unreasonably large or contains another active payload marker.
        if (/paramsJson|buttons|nativeFlow|interactive|caption|text/i.test(path) && value.length > 96 * 1024) {
            return `oversized rich-message field at ${path}`;
        }
        if (/paramsJson$/i.test(path)) {
            const issue = safeEmbeddedJson(value, path);
            if (issue) return issue;
        }
        return null;
    }

    if (isBinary(value)) {
        state.bytes += value.byteLength;
        if (value.byteLength > MAX_BINARY_BYTES) return `oversized binary field at ${path}`;
        if (state.bytes > MAX_TOTAL_BYTES) return `message exceeds ${MAX_TOTAL_BYTES} bytes`;
        return null;
    }

    if (typeof value !== 'object') return `unsupported value type at ${path}`;
    if (state.seen.has(value)) return null;
    state.seen.add(value);

    if (Array.isArray(value)) {
        if (value.length > MAX_ARRAY_ITEMS) return `oversized array at ${path}`;
        if (/mentionedJid/i.test(path) && value.length > MAX_MENTIONS) return `too many mentions at ${path}`;
        if (/nativeFlowMessage\.buttons|buttons$/i.test(path) && value.length > MAX_NATIVE_FLOW_BUTTONS) return `too many interactive buttons at ${path}`;
        if (/sticker(s)?$/i.test(path) && value.length > MAX_STICKER_PACK_ITEMS) return `too many stickers at ${path}`;
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
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') return `unsafe object key at ${path}`;
        const childPath = `${path}.${key}`;
        const child = value[key];
        if (/degreesLatitude/i.test(key) && (typeof child !== 'number' || !Number.isFinite(child) || child < -90 || child > 90)) return `invalid latitude at ${childPath}`;
        if (/degreesLongitude/i.test(key) && (typeof child !== 'number' || !Number.isFinite(child) || child < -180 || child > 180)) return `invalid longitude at ${childPath}`;
        if (/^(fileLength|stickerPackSize)$/i.test(key)) {
            const declared = Number(child);
            if (!Number.isFinite(declared) || declared < 0 || declared > MAX_MEDIA_DECLARED_BYTES) return `invalid declared media size at ${childPath}`;
        }
        if (/^(seconds|duration)$/i.test(key)) {
            const duration = Number(child);
            if (!Number.isFinite(duration) || duration < 0 || duration > MAX_MEDIA_SECONDS) return `invalid media duration at ${childPath}`;
        }
        const issue = inspectValue(child, state, childPath, depth + 1);
        if (issue) return issue;
    }
    return null;
}

function inspectMessage(message) {
    if (!message || typeof message !== 'object') return { suspicious: true, reason: 'message is not an object' };
    const key = message.key;
    if (!key || typeof key !== 'object') return { suspicious: true, reason: 'message key is missing' };
    for (const field of ['remoteJid', 'id', 'participant', 'participantAlt']) {
        if (key[field] != null && byteLength(key[field]) > MAX_JID_BYTES) return { suspicious: true, reason: `oversized message key field: ${field}` };
    }
    if (!message.message || typeof message.message !== 'object') return { suspicious: false, reason: null, nodes: 0, bytes: 0 };
    const types = Object.keys(message.message);
    if (types.length > MAX_MESSAGE_TYPES) return { suspicious: true, reason: `too many message types (${types.length})`, nodes: 0, bytes: 0 };
    const state = { nodes: 0, bytes: 0, seen: new WeakSet() };
    const reason = inspectValue(message.message, state, '$.message');
    return { suspicious: Boolean(reason), reason, nodes: state.nodes, bytes: state.bytes };
}

function sourceFor(message) {
    return message?.key?.participant || message?.key?.participantAlt || message?.participant || message?.key?.remoteJid || 'unknown';
}
function sourceKey(message) { return `${message?.key?.remoteJid || 'unknown'}:${sourceFor(message)}`; }
function rateCheck(chatId, sender) {
    const now = Date.now();
    const key = `${chatId}:${sender}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) bucket = { startedAt: now, count: 0 };
    const wasQuarantined = (quarantines.get(key) || 0) > now;
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    trimMap(rateBuckets, 4000);
    if (bucket.count > RATE_LIMIT) quarantines.set(key, now + QUARANTINE_MS);
    trimMap(quarantines, 4000);
    return { exceeded: bucket.count > RATE_LIMIT, count: bucket.count, newlyQuarantined: !wasQuarantined && bucket.count > RATE_LIMIT, quarantinedUntil: quarantines.get(key) || 0 };
}
function isQuarantined(chatId, sender) { return (quarantines.get(`${chatId}:${sender}`) || 0) > Date.now(); }
function canReport(key) { const now = Date.now(); const previous = reports.get(key) || 0; if (now - previous < REPORT_COOLDOWN_MS) return false; reports.set(key, now); trimMap(reports, 2000); return true; }
function timestampNumber(value) {
    if (value == null) return Math.floor(Date.now() / 1000);
    if (typeof value?.toNumber === 'function') return value.toNumber();
    if (typeof value === 'object' && value.low != null) return Number(value.low);
    const number = Number(value);
    return Number.isFinite(number) ? number : Math.floor(Date.now() / 1000);
}

function withTimeout(promise, ms) {
    return Promise.race([
        Promise.resolve(promise).then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), ms)),
    ]).catch(() => false);
}
async function deleteForBotOnly(sock, message) {
    const key = message?.key;
    if (!key?.id || !key.remoteJid || typeof sock?.chatModify !== 'function') return false;
    return withTimeout(sock.chatModify({ deleteForMe: { key: { remoteJid: key.remoteJid, fromMe: Boolean(key.fromMe), id: key.id, ...(key.participant ? { participant: key.participant } : {}), ...(key.participantAlt ? { participantAlt: key.participantAlt } : {}) }, timestamp: timestampNumber(message.messageTimestamp), deleteMedia: true } }, key.remoteJid), CONTAINMENT_TIMEOUT_MS);
}
async function clearChatForBotOnly(sock, message) {
    const key = message?.key;
    if (!key?.id || !key.remoteJid || typeof sock?.chatModify !== 'function') return false;
    return withTimeout(sock.chatModify({ clear: { lastMessages: [{ key: { remoteJid: key.remoteJid, fromMe: Boolean(key.fromMe), id: key.id, ...(key.participant ? { participant: key.participant } : {}) }, messageTimestamp: timestampNumber(message.messageTimestamp) }] } }, key.remoteJid), CONTAINMENT_TIMEOUT_MS);
}
async function reportToOwner(sock, ownerJid, phoneNumber, message, reason, flooded, localDeleted, chatCleared) {
    if (!ownerJid || typeof sock?.sendMessage !== 'function') return false;
    const chat = message?.key?.remoteJid || 'unknown';
    if (!canReport(`${phoneNumber || ownerJid}:${chat}`)) return false;
    const scope = chat.endsWith('@g.us') ? 'Group' : 'Personal chat';
    const reportTime = new Date().toISOString();
    const text = [
        '🛡️ *SUKUNA ANTIBUG — SECURITY INCIDENT*',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        `*Status:* Contained`,
        `*Time:* ${reportTime}`,
        `*Scope:* ${scope}`,
        `*Chat:* ${chat}`,
        `*Source:* ${sourceFor(message)}`,
        '',
        '*Detection*',
        `• ${reason}`,
        `• Flood circuit: ${flooded ? 'activated' : 'not activated'}`,
        '',
        '*Actions taken*',
        `• Local removal: ${localDeleted ? 'completed' : 'not completed'}`,
        `• Local chat cleanup: ${chatCleared ? 'completed' : 'not required'}`,
        '• Message processing: stopped before commands/media handling',
        '',
        '_The suspicious payload was not copied, executed, decoded, or forwarded._',
        '_This report was sent privately to the owner._',
    ].join('\n');
    return withTimeout(sock.sendMessage(ownerJid, { text }), CONTAINMENT_TIMEOUT_MS);
}

async function contain(sock, message, options, reason, flooded) {
    if (activeContainments >= MAX_ACTIVE_CONTAINMENTS) {
        return { deletedForMe: false, chatCleared: false, reported: false, overloaded: true };
    }
    activeContainments += 1;
    try {
    const deletedForMe = await deleteForBotOnly(sock, message);
    const chatCleared = flooded ? await clearChatForBotOnly(sock, message) : false;
    const reported = await reportToOwner(sock, options.ownerJid, options.phoneNumber, message, reason, flooded, deletedForMe, chatCleared);
    return { deletedForMe, chatCleared, reported };
    } finally {
        activeContainments -= 1;
    }
}

async function screenIncoming(sock, message, options = {}) {
    const from = message?.key?.remoteJid || '';
    if (!from || message?.key?.fromMe) return { blocked: false };
    let structural;
    try { structural = inspectMessage(message); } catch (_) { structural = { suspicious: true, reason: 'inspection failed safely' }; }
    const sender = sourceFor(message);
    const rate = rateCheck(from, sender);
    const circuitOpen = isQuarantined(from, sender);
    const flooded = rate.exceeded || circuitOpen;
    const suspicious = structural.suspicious || flooded;
    if (!suspicious) return { blocked: false, structural, rate };
    const isGroup = from.endsWith('@g.us');
    const group = isGroup ? database.getGroup(from) : {};
    const enabled = isGroup ? group.antibug !== false : options.personalEnabled === true;
    if (!enabled) return { blocked: false, suspicious: true, structural, flooded, disabled: true };
    const reason = flooded ? (rate.exceeded ? 'message rate exceeded' : 'sender/chat quarantine active') : structural.reason || 'malformed message structure';
    // Once the circuit is open, discard additional flood items without
    // launching another delete/report task for every packet.
    const repeatFlood = flooded && !structural.suspicious && !rate.newlyQuarantined;
    if (repeatFlood) return { blocked: true, suspicious: true, structural, flooded, quarantined: true, reason, containmentScheduled: false };
    // Critical availability property: the event loop is never held hostage by
    // chatModify/sendMessage. Production receive processing uses this mode.
    if (options.nonBlocking) {
        void contain(sock, message, options, reason, flooded).catch(() => {});
        return { blocked: true, suspicious: true, structural, flooded, quarantined: circuitOpen || rate.exceeded, reason, containmentScheduled: true };
    }
    const containment = await contain(sock, message, options, reason, flooded);
    return { blocked: true, suspicious: true, structural, flooded, quarantined: circuitOpen || rate.exceeded, reason, ...containment, deleted: containment.deletedForMe };
}

function clearRuntimeState() { rateBuckets.clear(); quarantines.clear(); reports.clear(); activeContainments = 0; }
module.exports = {
    inspectMessage,
    screenIncoming,
    clearRuntimeState,
    limits: { MAX_DEPTH, MAX_NODES, MAX_KEYS_PER_OBJECT, MAX_ARRAY_ITEMS, MAX_STRING_BYTES, MAX_BINARY_BYTES, MAX_TOTAL_BYTES, MAX_MESSAGE_TYPES, MAX_MENTIONS, MAX_NATIVE_FLOW_BUTTONS, MAX_STICKER_PACK_ITEMS, MAX_EMBEDDED_JSON_BYTES, MAX_MEDIA_DECLARED_BYTES, MAX_MEDIA_SECONDS, RATE_WINDOW_MS, RATE_LIMIT, QUARANTINE_MS, CONTAINMENT_TIMEOUT_MS, MAX_ACTIVE_CONTAINMENTS },
};

/**
 * Message Vault — stores EVERY incoming message so deletes can be recovered
 *
 * The anti-delete engine used to depend on a 500-messages-per-chat cache that
 * lived only inside lib/sessionManager.js. Anything older was unrecoverable.
 * This vault keeps a bounded, per-session record of every message the bot
 * receives, plus the raw Baileys message (needed to re-download media):
 *
 *   record = { entry: { id, jid, sender, senderNum, type, body, caption, … },
 *              raw:   <original Baileys message> }
 *
 * • entries are keyed by  "<jid>|<messageId>"
 * • TTL 6 hours, hard cap 1200 messages per session (oldest dropped first)
 * • text/metadata is persisted to data/antidelete-vault.json (debounced) so a
 *   restart does not lose recoverable text
 * • raw objects are memory-only (they are not serialisable) and only used as a
 *   fallback when the socket cache has already evicted the message
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const TTL_MS           = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PER_SESSION  = 1200;
const SAVE_DEBOUNCE_MS = 3000;

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE     = path.join(DATA_DIR, 'antidelete-vault.json');

// Map<phoneNumber, Map<"jid|id", { entry, raw }>>
const sessions = new Map();
let saveTimer  = null;

const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');

// ── Helpers ───────────────────────────────────────────────────────

function unwrap(message) {
    let content = message?.message || {};
    for (let i = 0; i < 6; i += 1) {
        const nested = content?.ephemeralMessage?.message
            || content?.viewOnceMessage?.message
            || content?.viewOnceMessageV2?.message
            || content?.viewOnceMessageV2Extension?.message
            || content?.documentWithCaptionMessage?.message;
        if (!nested) break;
        content = nested;
    }
    return content;
}

const MEDIA_TYPES = {
    imageMessage:    'image',
    videoMessage:    'video',
    audioMessage:    'audio',
    documentMessage: 'document',
    stickerMessage:  'sticker',
};

/** Classify a Baileys message into a compact, recoverable summary. */
function describe(message) {
    const content = unwrap(message);
    const text =
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.buttonsResponseMessage?.selectedDisplayText ||
        content?.listResponseMessage?.title ||
        null;

    const base = { text, caption: null, mimetype: null, fileName: null, ptt: false, type: 'unknown' };
    if (text) return { ...base, type: 'text' };

    for (const [key, type] of Object.entries(MEDIA_TYPES)) {
        const media = content?.[key];
        if (!media) continue;
        return {
            ...base,
            type,
            caption:  media.caption || null,
            mimetype: media.mimetype || null,
            fileName: media.fileName || null,
            ptt:      !!media.ptt,
        };
    }

    if (content?.contactMessage || content?.contactsArrayMessage) return { ...base, type: 'contact' };
    if (content?.locationMessage || content?.liveLocationMessage) return { ...base, type: 'location' };
    if (content?.pollCreationMessage || content?.pollCreationMessageV3) return { ...base, type: 'poll' };
    if (content?.reactionMessage) return { ...base, type: 'reaction' };

    return base;
}

// ── Persistence ───────────────────────────────────────────────────

function _load() {
    try {
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (!parsed || typeof parsed !== 'object') return;
        const cutoff = Date.now() - TTL_MS;
        for (const [phone, entries] of Object.entries(parsed)) {
            if (!Array.isArray(entries)) continue;
            const map = new Map();
            for (const entry of entries) {
                if (!entry?.id || !entry?.jid || !entry?.timestamp) continue;
                if (entry.timestamp < cutoff) continue;
                map.set(`${entry.jid}|${entry.id}`, { entry, raw: null });
            }
            if (map.size) sessions.set(digits(phone), map);
        }
    } catch (_) { /* no vault on disk yet */ }
}

function _schedulePersist() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            const out = {};
            for (const [phone, map] of sessions) {
                out[phone] = [];
                for (const record of map.values()) out[phone].push(record.entry);
            }
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(FILE, JSON.stringify(out));
        } catch (_) { /* never let persistence crash a session */ }
    }, SAVE_DEBOUNCE_MS);
    if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

_load();

// ── Public API ────────────────────────────────────────────────────

function _session(phoneNumber) {
    const key = digits(phoneNumber);
    if (!sessions.has(key)) sessions.set(key, new Map());
    return sessions.get(key);
}

/**
 * Store one incoming message. Safe to call for every upsert — protocol and
 * stub messages are ignored, and any failure is swallowed.
 */
function remember(phoneNumber, message, extra = {}) {
    try {
        const phone = digits(phoneNumber);
        const jid   = message?.key?.remoteJid;
        const id    = message?.key?.id;
        if (!phone || !jid || !id || !message?.message) return null;
        if (message.message.protocolMessage || message.messageStubType) return null;

        const sender    = message.key.participant || message.key.remoteJid;
        const senderNum = String(sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
        const info      = describe(message);

        const entry = {
            id,
            jid,
            sender:    sender || '',
            senderNum,
            type:      info.type,
            body:      info.text,
            caption:   info.caption,
            mimetype:  info.mimetype,
            fileName:  info.fileName,
            ptt:       info.ptt,
            fromMe:    !!message.key.fromMe,
            pushName:  message.pushName || extra.pushName || null,
            chatName:  extra.chatName || null,
            timestamp: Date.now(),
        };

        const map = _session(phone);
        map.set(`${jid}|${id}`, { entry, raw: message });

        // prune expired, then enforce the hard cap (oldest first)
        const cutoff = Date.now() - TTL_MS;
        for (const [key, record] of map) {
            if (record.entry.timestamp < cutoff) map.delete(key);
        }
        while (map.size > MAX_PER_SESSION) {
            map.delete(map.keys().next().value);
        }

        _schedulePersist();
        return entry;
    } catch (_) {
        return null;
    }
}

const MAX_MEDIA_BYTES = 12 * 1024 * 1024; // 12 MB per recovered attachment

/**
 * Pull an attachment down the moment it arrives.
 * WhatsApp refuses to serve media for a message that has been deleted, so
 * downloading later (after the revoke) is unreliable — the bytes have to be
 * captured while the message is still alive.
 */
async function cacheMedia(phoneNumber, message) {
    try {
        const jid = message?.key?.remoteJid;
        const id  = message?.key?.id;
        if (!jid || !id) return false;
        const record = _session(phoneNumber).get(`${jid}|${id}`);
        if (!record || record.mediaBuffer) return false;

        const content = unwrap(message);
        const kinds = {
            imageMessage:    'image',
            videoMessage:    'video',
            audioMessage:    'audio',
            documentMessage: 'document',
            stickerMessage:  'sticker',
        };
        for (const [key, kind] of Object.entries(kinds)) {
            const media = content?.[key];
            if (!media) continue;
            const declared = Number(media.fileLength || 0);
            if (declared && declared > MAX_MEDIA_BYTES) return false;

            const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
            const stream = await downloadContentFromMessage(media, kind);
            const chunks = [];
            let size = 0;
            for await (const chunk of stream) {
                size += chunk.length;
                if (size > MAX_MEDIA_BYTES) return false;
                chunks.push(chunk);
            }
            const buf = Buffer.concat(chunks);
            if (buf.length < 100) return false;

            record.mediaBuffer        = buf;
            record.entry.mediaCached  = true;
            record.entry.mediaSize    = buf.length;
            return true;
        }
    } catch (_) { /* media capture is best effort */ }
    return false;
}

/**
 * Stored summary for one message (or null).
 * The buffer is attached separately so recovery can re-upload the original
 * attachment without touching the network.
 */
function lookup(phoneNumber, jid, id) {
    if (!jid || !id) return null;
    try {
        const record = _session(phoneNumber).get(`${jid}|${id}`);
        if (!record) return null;
        if (Date.now() - record.entry.timestamp > TTL_MS) return null;
        return { ...record.entry, mediaBuffer: record.mediaBuffer || null };
    } catch (_) {
        return null;
    }
}

/** Raw Baileys message for one id — lets media still be re-downloaded. */
function getRaw(phoneNumber, jid, id) {
    if (!jid || !id) return null;
    try {
        return _session(phoneNumber).get(`${jid}|${id}`)?.raw || null;
    } catch (_) {
        return null;
    }
}

/** Newest-first list of stored entries, optionally scoped to one chat. */
function getRecent(phoneNumber, jid = null, limit = 25) {
    try {
        const cutoff = Date.now() - TTL_MS;
        const out = [];
        for (const record of _session(phoneNumber).values()) {
            if (record.entry.timestamp < cutoff) continue;
            if (jid && record.entry.jid !== jid) continue;
            out.push(record.entry);
        }
        out.sort((a, b) => b.timestamp - a.timestamp);
        return out.slice(0, Math.max(1, limit));
    } catch (_) {
        return [];
    }
}

function count(phoneNumber, jid = null) {
    try {
        const cutoff = Date.now() - TTL_MS;
        let total = 0;
        for (const record of _session(phoneNumber).values()) {
            if (record.entry.timestamp < cutoff) continue;
            if (jid && record.entry.jid !== jid) continue;
            total += 1;
        }
        return total;
    } catch (_) {
        return 0;
    }
}

function stats(phoneNumber) {
    const entries = getRecent(phoneNumber, null, MAX_PER_SESSION);
    const byType  = {};
    for (const entry of entries) byType[entry.type] = (byType[entry.type] || 0) + 1;
    return { total: entries.length, byType, cap: MAX_PER_SESSION, ttlHours: TTL_MS / 3_600_000 };
}

function clear(phoneNumber) {
    try {
        sessions.set(digits(phoneNumber), new Map());
        _schedulePersist();
    } catch (_) { /* noop */ }
}

module.exports = {
    remember,
    cacheMedia,
    lookup,
    getRaw,
    getRecent,
    count,
    stats,
    clear,
    describe,
    TTL_MS,
    MAX_PER_SESSION,
};

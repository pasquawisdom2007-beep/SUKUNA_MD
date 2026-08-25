'use strict';

const CHANNEL_URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:whatsapp\.com|wa\.me)\/channel\/[a-z0-9_-]{6,}/i;
const NEWSLETTER_JID_RE = /\b\d{8,}@newsletter\b/i;
const VIEW_CHANNEL_RE = /view[\s_-]*channel/i;
const CHANNEL_KEY_RE = /^(?:forwardednewslettermessageinfo|newsletterjid|channeljid|channel_id|channelid|viewchannel|view_channel)$/i;

function addSignal(signals, type, value) {
    if (signals.some(signal => signal.type === type && signal.value === value)) return;
    signals.push({ type, value });
}

function scanString(value, signals, source) {
    if (typeof value !== 'string' || !value || value.length > 4000) return;
    const text = value.trim();
    if (CHANNEL_URL_RE.test(text)) addSignal(signals, 'channel-url', text.match(CHANNEL_URL_RE)[0]);
    if (NEWSLETTER_JID_RE.test(text)) addSignal(signals, 'newsletter-jid', text.match(NEWSLETTER_JID_RE)[0]);
    if (VIEW_CHANNEL_RE.test(text)) addSignal(signals, 'view-channel', source || text);
}

function scanValue(value, signals, key = '', depth = 0, seen = new Set()) {
    if (value == null || depth > 7 || signals.length >= 8) return;
    if (typeof value === 'string') {
        scanString(value, signals, key);
        return;
    }
    if (typeof value !== 'object') return;
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return;
    if (seen.has(value)) return;
    seen.add(value);

    const normalizedKey = String(key || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
    if (CHANNEL_KEY_RE.test(normalizedKey)) {
        addSignal(signals, 'channel-metadata', normalizedKey);
    }

    if (Array.isArray(value)) {
        for (const item of value) scanValue(item, signals, key, depth + 1, seen);
        return;
    }

    for (const [childKey, childValue] of Object.entries(value)) {
        const childNormalized = childKey.replace(/[^a-z0-9_]/gi, '').toLowerCase();
        if (CHANNEL_KEY_RE.test(childNormalized)) {
            addSignal(signals, 'channel-metadata', childNormalized);
        }
        scanValue(childValue, signals, childKey, depth + 1, seen);
    }
}

function detectChannelMessage(message, body = '') {
    const signals = [];
    scanString(body, signals, 'message body');
    scanValue(message?.message || message, signals);
    return {
        hasChannel: signals.length > 0,
        signals,
        reason: signals.map(signal => `${signal.type}${signal.value ? ` (${signal.value})` : ''}`).join(', '),
    };
}

module.exports = {
    detectChannelMessage,
    CHANNEL_URL_RE,
    NEWSLETTER_JID_RE,
    VIEW_CHANNEL_RE,
};

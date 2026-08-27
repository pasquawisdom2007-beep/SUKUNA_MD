'use strict';

const MEDIA_TYPES = [
    ['imageMessage', 'image'],
    ['videoMessage', 'video'],
    ['audioMessage', 'audio'],
    ['documentMessage', 'document'],
];

// Baileys can place view-once content behind ephemeral, caption, edited, or
// any of the three view-once envelope versions. Keep traversal bounded because
// decrypted message objects may contain large metadata trees.
const WRAPPER_KEYS = [
    'viewOnceMessageV2Extension',
    'viewOnceMessageV2',
    'viewOnceMessage',
];
const TRANSPORT_KEYS = [
    'ephemeralMessage',
    'documentWithCaptionMessage',
    'editedMessage',
];

function isObject(value) {
    return !!value && typeof value === 'object' && !Buffer.isBuffer(value);
}

function nestedMessage(node, key) {
    const value = node?.[key];
    if (!value) return null;
    return value.message || value;
}

function directMedia(node) {
    if (!isObject(node)) return null;
    for (const [key, mediaType] of MEDIA_TYPES) {
        if (node[key]) return { mediaType, mediaMsg: node[key] };
    }
    return null;
}

function findMedia(node, depth = 0, seen = new Set()) {
    if (!isObject(node) || depth > 12 || seen.has(node)) return null;
    seen.add(node);

    const direct = directMedia(node);
    if (direct) return direct;

    for (const key of TRANSPORT_KEYS) {
        const inner = nestedMessage(node, key);
        const found = findMedia(inner, depth + 1, seen);
        if (found) return found;
    }

    for (const value of Object.values(node)) {
        if (!isObject(value)) continue;
        const found = findMedia(value, depth + 1, seen);
        if (found) return found;
    }
    return null;
}

function extractViewOnce(node, depth = 0, seen = new Set()) {
    if (!isObject(node) || depth > 12 || seen.has(node)) return null;
    seen.add(node);

    // Some WhatsApp clients omit the wrapper and leave the view-once marker
    // directly on the media node. Treat only an explicit marker as view-once;
    // ordinary images/videos must never be auto-forwarded.
    const direct = directMedia(node);
    if (direct && direct.mediaMsg?.viewOnce === true) {
        return { ...direct, isViewOnce: true, wrapper: 'direct-media-flag' };
    }

    for (const key of WRAPPER_KEYS) {
        const inner = nestedMessage(node, key);
        if (!inner) continue;
        const found = findMedia(inner);
        if (found) return { ...found, isViewOnce: true, wrapper: key };
        const nested = extractViewOnce(inner, depth + 1, seen);
        if (nested) return nested;
    }

    for (const key of TRANSPORT_KEYS) {
        const inner = nestedMessage(node, key);
        const found = extractViewOnce(inner, depth + 1, seen);
        if (found) return found;
    }

    for (const value of Object.values(node)) {
        if (!isObject(value)) continue;
        const found = extractViewOnce(value, depth + 1, seen);
        if (found) return found;
    }
    return null;
}

async function downloadMedia(mediaMsg, mediaType, retries = 3) {
    const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(Buffer.from(chunk));
            const buffer = Buffer.concat(chunks);
            if (!buffer.length) throw new Error('Empty media buffer received');
            return buffer;
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 750 * attempt));
            }
        }
    }
    throw lastError || new Error('Media download failed');
}

module.exports = {
    MEDIA_TYPES,
    extractViewOnce,
    findMedia,
    downloadMedia,
};

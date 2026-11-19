'use strict';

const MEDIA_TYPES = Object.freeze({
    imageMessage: 'image',
    videoMessage: 'video',
    audioMessage: 'audio',
    documentMessage: 'document',
});

const VIEW_ONCE_WRAPPERS = Object.freeze([
    'viewOnceMessageV2Extension',
    'viewOnceMessageV2',
    'viewOnceMessage',
]);

const TRANSPORT_WRAPPERS = Object.freeze([
    'ephemeralMessage',
    'documentWithCaptionMessage',
    'editedMessage',
]);

function isObject(value) {
    return !!value && typeof value === 'object' && !Buffer.isBuffer(value);
}

function inner(node, key) {
    const value = node?.[key];
    return value?.message || value || null;
}

function directMedia(node) {
    if (!isObject(node)) return null;
    for (const [key, mediaType] of Object.entries(MEDIA_TYPES)) {
        if (node[key] && typeof node[key] === 'object') {
            return { mediaType, mediaMsg: node[key] };
        }
    }
    return null;
}

function findMedia(node, depth = 0, seen = new Set()) {
    if (!isObject(node) || depth > 16 || seen.has(node)) return null;
    seen.add(node);
    const direct = directMedia(node);
    if (direct) return direct;
    for (const key of [...VIEW_ONCE_WRAPPERS, ...TRANSPORT_WRAPPERS]) {
        const found = findMedia(inner(node, key), depth + 1, seen);
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
    if (!isObject(node) || depth > 16 || seen.has(node)) return null;
    seen.add(node);
    const direct = directMedia(node);
    if (direct && direct.mediaMsg.viewOnce === true) {
        return { ...direct, isViewOnce: true, wrapper: 'direct-media-flag' };
    }
    for (const key of VIEW_ONCE_WRAPPERS) {
        const content = inner(node, key);
        if (!content) continue;
        const found = findMedia(content) || extractViewOnce(content, depth + 1, seen);
        if (found) return { ...found, isViewOnce: true, wrapper: key };
    }
    for (const key of TRANSPORT_WRAPPERS) {
        const found = extractViewOnce(inner(node, key), depth + 1, seen);
        if (found) return found;
    }
    for (const value of Object.values(node)) {
        if (!isObject(value)) continue;
        const found = extractViewOnce(value, depth + 1, seen);
        if (found) return found;
    }
    return null;
}

function hasUsableDescriptor(mediaMsg) {
    return !!(mediaMsg && (mediaMsg.url || mediaMsg.directPath) && mediaMsg.mediaKey);
}

function asFullMessage(candidate) {
    if (!candidate) return null;
    if (candidate.message && candidate.key) return candidate;
    if (candidate.message) return { key: candidate.key || {}, message: candidate.message };
    return { key: {}, message: candidate };
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

/**
 * Download a complete Baileys message. The message-level API is important for
 * view-once envelopes because it unwraps V1/V2/V2Extension before resolving
 * the media descriptor. The low-level API is used only for a known descriptor.
 */
async function downloadMessageBuffer(candidate, found = null, retries = 2) {
    const { downloadMediaMessage, downloadContentFromMessage } = require('@pasqua-dev/baileys');
    const fullMessage = asFullMessage(candidate);
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            let buffer;
            if (fullMessage && typeof downloadMediaMessage === 'function') {
                buffer = await downloadMediaMessage(fullMessage, 'buffer');
            } else if (found && hasUsableDescriptor(found.mediaMsg)) {
                buffer = await streamToBuffer(await downloadContentFromMessage(found.mediaMsg, found.mediaType));
            } else {
                throw new Error('The original media descriptor is unavailable');
            }
            if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Empty media buffer received');
            return buffer;
        } catch (error) {
            lastError = error;
            if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 600 * attempt));
        }
    }
    throw lastError || new Error('View-once media download failed');
}

// Backward-compatible name used by the anti-view-once engine.
async function downloadMedia(mediaMsg, mediaType, retries = 2, fullMessage = null) {
    return downloadMessageBuffer(fullMessage, { mediaMsg, mediaType }, retries);
}

module.exports = {
    MEDIA_TYPES: Object.entries(MEDIA_TYPES),
    VIEW_ONCE_WRAPPERS,
    extractViewOnce,
    findMedia,
    hasUsableDescriptor,
    downloadMessageBuffer,
    downloadMedia,
};

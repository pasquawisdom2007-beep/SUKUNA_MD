'use strict';

const messageVault = require('../../utils/messageVault');
const {
    extractViewOnce,
    findMedia,
    downloadMessageBuffer,
} = require('../../utils/viewOnce');

function contextInfoOf(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 12) return null;
    if (node.contextInfo) return node.contextInfo;
    for (const value of Object.values(node)) {
        if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) continue;
        const found = contextInfoOf(value, depth + 1);
        if (found) return found;
    }
    return null;
}

function rawQuotedMessage(msg) {
    const context = contextInfoOf(msg?.message);
    return context?.quotedMessage || null;
}

function collectQuotedChain(quoted, fallbackRaw, from, sock) {
    const chain = [];
    const seen = new Set();
    let current = quoted || (fallbackRaw ? {
        key: { remoteJid: from, id: '' },
        message: fallbackRaw,
    } : null);
    while (current && chain.length < 8) {
        const id = current.key?.id || '';
        const signature = `${id}:${Object.keys(current.message || {}).join(',')}`;
        if (seen.has(signature)) break;
        seen.add(signature);
        chain.push(current);
        current = current.quoted;
    }
    // The framework can expose a stripped first quote while the original raw
    // message is available in its per-session cache or vault.
    for (const item of [...chain]) {
        const id = item.key?.id;
        if (!id) continue;
        const cached = sock?.__sukunaMessageCache?.get(from)?.get(id);
        if (cached && !chain.some(candidate => candidate.key?.id === id && candidate.message === cached.message)) {
            chain.push({ key: cached.key, message: cached.message });
        }
    }
    return chain;
}

function locateMedia({ chain, phoneNumber, from }) {
    for (const item of chain) {
        const id = item.key?.id;
        const local = phoneNumber && id ? messageVault.lookup(phoneNumber, from, id) : null;
        const raw = phoneNumber && id ? messageVault.getRaw(phoneNumber, from, id) : null;
        const message = raw?.message || item.message || {};
        const found = extractViewOnce(message) || findMedia(message);
        if (found) return { item, raw, found, local };
    }
    return null;
}

function mediaPayload(mediaType, buffer, mediaMsg) {
    if (mediaType === 'image') return { image: buffer };
    if (mediaType === 'video') return { video: buffer, mimetype: mediaMsg.mimetype || 'video/mp4' };
    if (mediaType === 'audio') return { audio: buffer, mimetype: mediaMsg.mimetype || 'audio/ogg; codecs=opus', ptt: !!mediaMsg.ptt };
    if (mediaType === 'document') return { document: buffer, mimetype: mediaMsg.mimetype || 'application/octet-stream', fileName: mediaMsg.fileName || 'revealed-file' };
    throw new Error(`Unsupported view-once media type: ${mediaType}`);
}

module.exports = {
    name: 'vv',
    aliases: ['viewonce', 'reveal', 'vo'],
    description: 'Reveal a view-once image, video, audio, or document',
    usage: '.vv (reply to a view-once message)',
    category: 'fun',

    async execute({ sock, msg, from, reply, phoneNumber, quoted }) {
        const rawQuoted = rawQuotedMessage(msg);
        const chain = collectQuotedChain(quoted, rawQuoted, from, sock);
        if (!chain.length) {
            return reply('👁️ *VIEW ONCE REVEAL*\n\n❌ Reply directly to a view-once image, video, audio, or document with `.vv`.');
        }

        const located = locateMedia({ chain, phoneNumber, from });
        if (!located) {
            return reply('👁️ *VIEW ONCE REVEAL*\n\n❌ No media was found in the complete quoted-message chain.');
        }

        const { item, raw, found, local } = located;
        let buffer = local?.mediaBuffer || null;
        try {
            if (!buffer) {
                const completeMessage = raw || (item.message ? { key: item.key || {}, message: item.message } : null);
                try {
                    buffer = await downloadMessageBuffer(completeMessage, found, 2);
                } catch (downloadError) {
                    // The normalized quote may already be backed by the
                    // framework/vault's local media stream. Prefer that over
                    // retrying a stripped WhatsApp descriptor.
                    if (typeof item.download !== 'function') throw downloadError;
                    buffer = await item.download();
                }
            }
            await sock.sendMessage(from, mediaPayload(found.mediaType, buffer, found.mediaMsg), { quoted: msg });
        } catch (error) {
            console.error('[VV rebuild] reveal failed:', error.message);
            const reason = /404|not found|expired|directpath|url/i.test(error.message)
                ? 'The original WhatsApp media descriptor has expired and no local copy is available.'
                : error.message;
            return reply(`👁️ *VIEW ONCE REVEAL*\n\n❌ Failed to reveal the media.\n\n_${reason}_`);
        }
    },

    __test: { contextInfoOf, rawQuotedMessage, collectQuotedChain, locateMedia, mediaPayload },
};

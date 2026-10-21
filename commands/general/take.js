'use strict';

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
const { brandSticker, DEFAULT_PACK_NAME, DEFAULT_PUBLISHER } = require('../../utils/stickerMetadata');

const DOWNLOAD_TIMEOUT_MS = 45_000;

function unwrapMessage(message) {
    let current = message;
    for (let i = 0; i < 6 && current; i += 1) {
        const wrapped = current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.viewOnceMessageV2Extension?.message
            || current.ephemeralMessage?.message;
        if (!wrapped) break;
        current = wrapped;
    }
    return current || message;
}

function quotedMessage(msg) {
    const message = msg?.message || {};
    const context = message.extendedTextMessage?.contextInfo
        || message.imageMessage?.contextInfo
        || message.videoMessage?.contextInfo
        || message.stickerMessage?.contextInfo
        || message.ephemeralMessage?.message?.extendedTextMessage?.contextInfo
        || null;
    return unwrapMessage(context?.quotedMessage || null);
}

async function downloadSticker(stickerMessage) {
    const timer = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
    const stream = await downloadContentFromMessage(stickerMessage, 'sticker', { signal: timer });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw new Error('downloaded sticker is empty');
    return buffer;
}

module.exports = {
    name: 'take',
    aliases: ['takesticker'],
    description: 'Take a replied sticker and brand it as a SUKUNA MD sticker',
    usage: 'Reply to a sticker with .take',
    category: 'general',

    async execute({ sock, msg, from, reply }) {
        const quoted = quotedMessage(msg);
        const sticker = quoted?.stickerMessage;
        if (!sticker) {
            return reply(
                `🎨 *Take Sticker*\n\n` +
                `Reply to a sticker with *.take* and I will rebrand it as:\n` +
                `• Pack: *${DEFAULT_PACK_NAME}*\n` +
                `• Creator: *${DEFAULT_PUBLISHER}*`
            );
        }

        try {
            await reply('⏳ _Taking sticker and applying SUKUNA MD branding..._');
            const original = await downloadSticker(sticker);
            const branded = await brandSticker(original);
            await sock.sendMessage(from, {
                sticker: branded,
                // Keep native message metadata alongside the WebP EXIF payload
                // for clients that inspect the outgoing message fields.
                packname: DEFAULT_PACK_NAME,
                author: DEFAULT_PUBLISHER,
            }, { quoted: msg });
        } catch (error) {
            return reply(`❌ Failed to take sticker: ${error.message || 'invalid sticker data'}`);
        }
    },
};

module.exports._private = { quotedMessage, unwrapMessage, downloadSticker };

'use strict';

const { downloadMediaMessage } = require('@pasqua-baileys/baileys');
const { upscaleImage } = require('../../utils/upscale');

function imageTarget(msg) {
    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const quoted = context?.quotedMessage;
    if (quoted?.imageMessage) return { message: quoted, key: msg.key, node: quoted.imageMessage };
    if (msg?.message?.imageMessage) return { message: msg.message, key: msg.key, node: msg.message.imageMessage };
    return null;
}

module.exports = {
    name: 'upscale',
    aliases: ['enhance', 'hd', '4k'],
    description: 'Upscale a replied image locally without an API key',
    category: 'media',

    async execute({ sock, msg, from, reply, args }) {
        const target = imageTarget(msg);
        if (!target) {
            return reply('🖼️ Reply to an image with `.upscale` to enhance it.\n\nOptional: `.upscale 2` or `.upscale 4`');
        }

        const scale = Number(args?.[0]) || 4;
        if (![2, 4].includes(scale)) return reply('❌ Choose a scale of `2` or `4`.');

        try {
            await reply(`⏳ Upscaling image ${scale}× locally...`);
            const buffer = await downloadMediaMessage(target, 'buffer', {});
            const output = await upscaleImage(buffer, scale);
            await sock.sendMessage(from, {
                image: output,
                caption: `✅ *Image upscaled ${scale}×*\nEnhanced locally with Sharp — no API key required.`,
            }, { quoted: msg });
        } catch (error) {
            console.error('[upscale]', error);
            return reply(`❌ Upscaling failed: ${error.message || 'unknown error'}`);
        }
    },
};

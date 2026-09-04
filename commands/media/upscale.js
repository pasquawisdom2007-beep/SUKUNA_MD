'use strict';

const { downloadMediaMessage } = require('@pasqua-baileys/baileys');
const { upscaleWithReplicate } = require('../../utils/upscale');

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
    description: 'Upscale a replied image with Real-ESRGAN',
    category: 'media',

    async execute({ sock, msg, from, reply, args }) {
        const target = imageTarget(msg);
        if (!target) {
            return reply('🖼️ Reply to an image with `.upscale` to enhance it.\n\nOptional: `.upscale 2` or `.upscale 4`');
        }
        if (!process.env.REPLICATE_API_TOKEN && !process.env.REPLICATE_TOKEN) {
            return reply('⚙️ Upscaling is not configured. Add `REPLICATE_API_TOKEN` to the bot environment.');
        }

        const scale = Number(args?.[0]) || 4;
        if (![2, 4].includes(scale)) return reply('❌ Choose a scale of `2` or `4`.');
        const faceEnhance = ['face', 'faces', 'portrait'].includes(String(args?.[1] || '').toLowerCase());

        try {
            await reply(`⏳ Upscaling image ${scale}×${faceEnhance ? ' with face enhancement' : ''}...`);
            const buffer = await downloadMediaMessage(target, 'buffer', {});
            const mimeType = target.node?.mimetype || 'image/jpeg';
            const output = await upscaleWithReplicate(buffer, mimeType, scale, faceEnhance);
            await sock.sendMessage(from, {
                image: output,
                caption: `✅ *Image upscaled ${scale}×*${faceEnhance ? ' with face enhancement' : ''}\nPowered by Real-ESRGAN`,
            }, { quoted: msg });
        } catch (error) {
            console.error('[upscale]', error);
            return reply(`❌ Upscaling failed: ${error.message || 'unknown error'}`);
        }
    },
};

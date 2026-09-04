'use strict';

const { downloadMediaMessage } = require('@pasqua-baileys/baileys');
const upscaler = require('../../utils/upscale');

const localUpscale = upscaler.localUpscale || upscaler.upscaleImage;
const upscaleWithUpscayl = upscaler.upscaleWithUpscayl;
const upscaleWithReplicate = upscaler.upscaleWithReplicate;
const hasUpscayl = upscaler.hasUpscayl || (() => false);
const hasReplicateToken = upscaler.hasReplicateToken || (() => Boolean(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN));

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
    description: 'Upscale a replied image with Upscayl, AI, or a local fallback',
    category: 'media',

    async execute({ sock, msg, from, reply, args }) {
        const target = imageTarget(msg);
        if (!target) {
            return reply('🖼️ Reply to an image with `.upscale` to enhance it.\n\nDefault order: Upscayl → AI provider → local fallback.\nUse `.upscale local` to force the no-network fallback or `.upscale ai` to force the Replicate provider.');
        }

        const rawArgs = (args || []).map(value => String(value).toLowerCase());
        const forceAI = rawArgs.includes('ai');
        const forceLocal = rawArgs.includes('local');
        const scale = Number(rawArgs.find(value => ['2', '4'].includes(value)) || 4);
        if (![2, 4].includes(scale)) return reply('❌ Choose a scale of `2` or `4`.');
        const aiAvailable = hasReplicateToken();
        if (forceAI && !aiAvailable) return reply('⚙️ Set `REPLICATE_API_TOKEN` in the panel environment to use `.upscale ai`. Never paste the key into a command file.');

        try {
            const buffer = await downloadMediaMessage(target, 'buffer', {});
            const mimeType = target.node?.mimetype || 'image/jpeg';
            let output;
            let mode;

            if (!forceLocal && !forceAI && hasUpscayl()) {
                await reply(`⏳ Upscayl is enhancing the image ${scale}× locally...`);
                try {
                    output = await upscaleWithUpscayl(buffer, mimeType, scale);
                    mode = 'Upscayl Real-ESRGAN';
                } catch (upscaylError) {
                    console.error('[upscale Upscayl]', upscaylError.message);
                    await reply(`⚠️ Upscayl was unavailable (${upscaylError.message || 'provider error'}). Trying the next available method...`);
                }
            }

            if (!output && !forceLocal && aiAvailable) {
                await reply(`⏳ AI-upscaling image ${scale}× with face and texture enhancement...`);
                try {
                    output = await upscaleWithReplicate(buffer, mimeType, scale, true);
                    mode = 'AI face + texture enhancement';
                } catch (aiError) {
                    console.error('[upscale AI]', aiError.message);
                    await reply(`⚠️ AI upscaler unavailable (${aiError.message || 'provider error'}). Using the local fallback...`);
                }
            }

            if (!output) {
                if (typeof localUpscale !== 'function') throw new Error('upscale helper is unavailable');
                await reply(`⏳ Upscaling image ${scale}× locally...`);
                output = await localUpscale(buffer, scale);
                mode = 'local Sharp enhancement';
            }

            await sock.sendMessage(from, {
                image: output,
                caption: `✅ *Image upscaled ${scale}×*\n${mode}.`,
            }, { quoted: msg });
        } catch (error) {
            console.error('[upscale]', error);
            return reply(`❌ Upscaling failed: ${error.message || 'unknown error'}`);
        }
    },
};

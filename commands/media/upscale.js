'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// EASY SETUP: paste your Replicate API key between the quotes below.
// Leave it blank to use REPLICATE_API_TOKEN or the local no-key fallback.
// Do not share this file after adding your private key.
const REPLICATE_API_KEY = 'r8_LAS6hB5lETpp2pmUYHpDBVkhRTVOKQ119wWnv';

const { downloadMediaMessage } = require('@pasqua-baileys/baileys');
const upscaler = require('../../utils/upscale');
// Compatibility with panel copies made before the helper was renamed.
const localUpscale = upscaler.localUpscale || upscaler.upscaleImage;
const upscaleWithReplicate = upscaler.upscaleWithReplicate;
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
    description: 'Upscale a replied image with optional AI face and texture enhancement',
    category: 'media',

    async execute({ sock, msg, from, reply, args }) {
        const target = imageTarget(msg);
        if (!target) {
            return reply('🖼️ Reply to an image with `.upscale` to enhance it.\n\n`.upscale` uses AI when configured, otherwise local mode.\nUse `.upscale local` to force the no-key fallback.');
        }

        const rawArgs = (args || []).map(value => String(value).toLowerCase());
        const forceAI = rawArgs.includes('ai');
        const forceLocal = rawArgs.includes('local');
        const scale = Number(rawArgs.find(value => ['2', '4'].includes(value)) || 4);
        if (![2, 4].includes(scale)) return reply('❌ Choose a scale of `2` or `4`.');
        const hasAIKey = Boolean(REPLICATE_API_KEY.trim()) || hasReplicateToken();
        if (forceAI && !hasAIKey) return reply('⚙️ Paste your key into `REPLICATE_API_KEY` at the top of commands/media/upscale.js, or set `REPLICATE_API_TOKEN`.');

        try {
            const buffer = await downloadMediaMessage(target, 'buffer', {});
            const mimeType = target.node?.mimetype || 'image/jpeg';
            let output;
            let mode;

            if (!forceLocal && hasAIKey) {
                await reply(`⏳ AI-upscaling image ${scale}× with face and texture enhancement...`);
                try {
                    output = await upscaleWithReplicate(buffer, mimeType, scale, true, REPLICATE_API_KEY.trim() || undefined);
                    mode = 'AI face + texture enhancement';
                } catch (aiError) {
                    console.error('[upscale AI]', aiError.message);
                    await reply(`⚠️ AI upscaler unavailable (${aiError.message || 'provider error'}). Using the local fallback...`);
                }
            }

            if (!output) {
                if (typeof localUpscale !== 'function') throw new Error('upscale helper is outdated; update both commands/media/upscale.js and utils/upscale.js');
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

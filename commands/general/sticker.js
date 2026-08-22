/**
 * Sticker Command — Converts a tagged/replied photo or video into a WhatsApp sticker
 *
 * Usage:
 *   Reply to any photo + .sticker  → image sticker
 *   Reply to any video + .sticker  → animated/video sticker
 *   Reply to a sticker + .sticker  → re-sends as sticker
 *
 * Requires: sharp (npm install sharp) for best image conversion
 * Video stickers require ffmpeg on the server (optional)
 */

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TIMEOUT_MS = 30000;

async function downloadMedia(mediaMsg, type) {
    return new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Download timed out')), TIMEOUT_MS);
        try {
            const stream = await downloadContentFromMessage(mediaMsg, type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            clearTimeout(timer);
            resolve(Buffer.concat(chunks));
        } catch (err) {
            clearTimeout(timer);
            reject(err);
        }
    });
}

function toWebpWithSharp(buffer) {
    return new Promise((resolve, reject) => {
        try {
            const sharp = require('sharp');
            sharp(buffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp({ quality: 80 })
                .toBuffer()
                .then(resolve)
                .catch(reject);
        } catch (e) {
            // sharp not installed — return raw buffer and hope for the best
            resolve(buffer);
        }
    });
}

function videoToWebp(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        // Convert first 6 seconds of video to animated WebP
        exec(
            `ffmpeg -y -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15" ` +
            `-t 6 -vcodec libwebp -lossless 0 -compression_level 6 -q:v 50 ` +
            `-loop 0 -preset default -an -vsync 0 "${outputPath}"`,
            { timeout: 30000 },
            (err) => (err ? reject(err) : resolve())
        );
    });
}

function getQuoted(msg) {
    const m = msg.message;
    const ctx =
        m?.extendedTextMessage?.contextInfo ||
        m?.imageMessage?.contextInfo ||
        m?.videoMessage?.contextInfo ||
        null;
    return { ctx, quoted: ctx?.quotedMessage || null };
}

module.exports = {
    name: 'sticker',
    aliases: ['s', 'stiker', 'toSticker'],
    description: 'Convert a tagged photo or video into a WhatsApp sticker',
    usage: 'Reply to a photo or video + .sticker',
    category: 'general',

    async execute({ sock, msg, from, args, reply }) {
        const { quoted } = getQuoted(msg);
        const packName  = args.join(' ') || 'SUKUNA MD';

        // ── Quoted sticker — forward as-is ───────────────────────────────────
        if (quoted?.stickerMessage) {
            try {
                const buf = await downloadMedia(quoted.stickerMessage, 'sticker');
                await sock.sendMessage(from, { sticker: buf }, { quoted: msg });
                return;
            } catch (err) {
                return reply(`❌ Failed to forward sticker: ${err.message}`);
            }
        }

        // ── Image sticker ─────────────────────────────────────────────────────
        if (quoted?.imageMessage) {
            await reply('⏳ _Creating image sticker..._');
            try {
                const rawBuf  = await downloadMedia(quoted.imageMessage, 'image');
                const webpBuf = await toWebpWithSharp(rawBuf);
                await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
                return;
            } catch (err) {
                return reply(`❌ Failed to create sticker: ${err.message}`);
            }
        }

        // ── Video sticker ─────────────────────────────────────────────────────
        if (quoted?.videoMessage) {
            await reply('⏳ _Creating animated sticker (this may take a moment)..._');

            const tmpIn  = path.join(os.tmpdir(), `stk_in_${Date.now()}.mp4`);
            const tmpOut = path.join(os.tmpdir(), `stk_out_${Date.now()}.webp`);

            try {
                const rawBuf = await downloadMedia(quoted.videoMessage, 'video');
                fs.writeFileSync(tmpIn, rawBuf);

                // Try ffmpeg conversion first
                let stickerBuf;
                try {
                    await videoToWebp(tmpIn, tmpOut);
                    stickerBuf = fs.readFileSync(tmpOut);
                } catch (_) {
                    // ffmpeg not available — send raw video buffer directly
                    stickerBuf = rawBuf;
                }

                await sock.sendMessage(from, { sticker: stickerBuf }, { quoted: msg });
                return;
            } catch (err) {
                return reply(`❌ Failed to create video sticker: ${err.message}`);
            } finally {
                for (const f of [tmpIn, tmpOut]) {
                    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
                }
            }
        }

        // ── No media found ────────────────────────────────────────────────────
        return reply(
            `🎨 *Sticker Maker*\n\n` +
            `Reply to a *photo* or *video* with \`.sticker\` to convert it!\n\n` +
            `*Example:*\n` +
            `• Reply to any image + \`.sticker\`\n` +
            `• Reply to any video + \`.sticker\` (animated)\n` +
            `• Reply to existing sticker + \`.sticker\` to forward it\n\n` +
            `_Video stickers require ffmpeg on the server_`
        );
    }
};

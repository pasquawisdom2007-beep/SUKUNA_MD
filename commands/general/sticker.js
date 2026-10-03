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
const fs = require('fs');
const sharp = require('sharp');
const { runFfmpeg, FFMPEG } = require('../../utils/mediaCommand');

const TIMEOUT_MS = 30000;
const VIDEO_STICKER_MAX_SECONDS = 6;
// The bundled ffmpeg-static binary can fail on animated WebP output on some
// Linux hosts. Prefer the system FFmpeg, while retaining ffmpeg-static as a
// fallback for local deployments.
const STICKER_FFMPEG = process.env.FFMPEG_PATH
    || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : FFMPEG);
const VIDEO_STICKER_FILTER = [
    'fps=15',
    'scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2',
    // Use an opaque, even-sized canvas. The alpha WebP path in some FFmpeg
    // builds creates malformed animation chunks that WhatsApp displays as
    // horizontal split lines.
    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black',
    'format=yuv420p',
].join(',');

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

async function videoToWebp(inputBuffer) {
    if (!Buffer.isBuffer(inputBuffer) || !inputBuffer.length) {
        throw new Error('empty video input');
    }

    // Pipe the source and output through FFmpeg instead of using shell paths.
    // The explicit fps/pad/pixel-format chain prevents torn/split animated
    // WebP frames on WhatsApp, especially for portrait and odd-sized videos.
    const commonArgs = [
        '-i', 'pipe:0',
        '-t', String(VIDEO_STICKER_MAX_SECONDS),
        '-vf', VIDEO_STICKER_FILTER,
        '-an',
        '-lossless', '0',
        '-q:v', '55',
        '-compression_level', '6',
        '-loop', '0',
        '-f', 'webp',
        'pipe:1',
    ];
    let lastError;
    // libwebp is present in substantially more panel/static FFmpeg builds;
    // libwebp_anim remains a fallback for builds that expose that encoder only.
    for (const encoder of ['libwebp', 'libwebp_anim']) {
        try {
            return await runFfmpeg([
                ...commonArgs.slice(0, 6),
                '-c:v', encoder,
                ...commonArgs.slice(6),
            ], inputBuffer, {
                timeout: TIMEOUT_MS,
                maxOutputBytes: 8 * 1024 * 1024,
                binary: STICKER_FFMPEG,
            }).then(async output => {
                // Some FFmpeg builds return exit code 0 while emitting a
                // malformed animated WebP. Parse it before accepting it.
                const metadata = await sharp(output, { animated: true }).metadata();
                if (metadata.format !== 'webp' || metadata.width !== 512 || metadata.pageHeight !== 512) {
                    throw new Error(`encoder ${encoder} produced invalid WebP output`);
                }
                return output;
            });
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('no compatible WebP encoder available');
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
            try {
                const rawBuf = await downloadMedia(quoted.videoMessage, 'video');
                const stickerBuf = await videoToWebp(rawBuf);
                await sock.sendMessage(from, { sticker: stickerBuf }, { quoted: msg });
                return;
            } catch (err) {
                return reply(`❌ Failed to create video sticker: ${err.message || 'FFmpeg conversion failed'}`);
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
            `_Animated video stickers require FFmpeg on the server_`
        );
    }
};

module.exports.videoToWebp = videoToWebp;
module.exports.VIDEO_STICKER_FILTER = VIDEO_STICKER_FILTER;

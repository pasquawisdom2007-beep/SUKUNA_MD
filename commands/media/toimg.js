/**
 * ToImg — convert a sticker back to media.
 *   • Static .webp sticker  → JPEG image
 *   • Animated .webp sticker → MP4 video (with ffmpeg) or animated WebP fallback
 *
 * Robust against the dispatcher: uses Baileys' own `downloadContentFromMessage`
 * on the quoted message, never the unreliable `sock.loadMessage` shortcut.
 *
 * Usage: reply to a sticker with .toimg
 */
'use strict';

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
const { exec }  = require('child_process');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');
const crypto    = require('crypto');

const TIMEOUT_MS = 30000;

function tmp(ext) {
    return path.join(os.tmpdir(), `toimg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
}

function run(cmd, ms = 30000) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: ms, maxBuffer: 10 * 1024 * 1024 }, (err, _so, se) =>
            err ? reject(new Error(se || err.message)) : resolve()
        );
    });
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

function downloadSticker(stickerMsg) {
    return new Promise(async (resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Sticker download timed out')), TIMEOUT_MS);
        try {
            const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
            const buf = await streamToBuffer(stream);
            clearTimeout(t);
            resolve(buf);
        } catch (e) { clearTimeout(t); reject(e); }
    });
}

async function webpToJpeg(webpBuf) {
    // Try sharp first (fast, no shell)
    try {
        const sharp = require('sharp');
        return await sharp(webpBuf)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .jpeg({ quality: 92 })
            .toBuffer();
    } catch (_) { /* fall back to ffmpeg */ }

    const inP  = tmp('.webp');
    const outP = tmp('.jpg');
    fs.writeFileSync(inP, webpBuf);
    try {
        await run(`ffmpeg -y -i "${inP}" -frames:v 1 -q:v 2 "${outP}"`);
        return fs.readFileSync(outP);
    } finally {
        fs.unlinkSync(inP); try { fs.unlinkSync(outP); } catch (_) {}
    }
}

async function webpToMp4(webpBuf) {
    const inP  = tmp('.webp');
    const outP = tmp('.mp4');
    fs.writeFileSync(inP, webpBuf);
    try {
        // Animated WebP → MP4 (h264 + yuv420p so WhatsApp shows it inline).
        // Pad to even dimensions because libx264 requires it.
        await run(
            `ffmpeg -y -i "${inP}" -movflags +faststart ` +
            `-vf "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p" ` +
            `-c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 -an "${outP}"`,
            45000
        );
        return fs.readFileSync(outP);
    } finally {
        fs.unlinkSync(inP); try { fs.unlinkSync(outP); } catch (_) {}
    }
}

/**
 * Sniff a WebP buffer for the ANIM / ANMF RIFF chunks — the ground truth
 * for "this is an animated WebP" regardless of what stickerMessage flags say.
 */
function isAnimatedWebp(buf) {
    if (!buf || buf.length < 30) return false;
    // RIFF....WEBPVP8X then ANIM/ANMF chunk headers
    const head = buf.subarray(0, Math.min(buf.length, 4096)).toString('binary');
    return head.indexOf('ANIM') !== -1 || head.indexOf('ANMF') !== -1;
}

module.exports = {
    name: 'toimg',
    aliases: ['stickertoimg', 's2i', 's2img', 'tophoto'],
    description: 'Convert a sticker back to image (or video for animated stickers)',
    category: 'media',

    async execute({ sock, msg, from, reply }) {
        const ctx = msg.message?.extendedTextMessage?.contextInfo
                 || msg.message?.imageMessage?.contextInfo
                 || msg.message?.videoMessage?.contextInfo
                 || null;
        const quoted = ctx?.quotedMessage;
        const stickerMsg = quoted?.stickerMessage;

        if (!stickerMsg) {
            return reply(
                `🖼️ *Sticker → Image / Video*\n\n` +
                `Reply to a sticker with .toimg\n` +
                `• Static stickers come back as an image\n` +
                `• Animated stickers come back as a short video`
            );
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        let webpBuf;
        try {
            webpBuf = await downloadSticker(stickerMsg);
            if (!webpBuf?.length) throw new Error('empty buffer');
        } catch (e) {
            console.error('[toimg:download]', e.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply('❌ Could not download that sticker. Try forwarding it once and retry.');
        }

        // Trust the WebP buffer signature over the (often missing) flags.
        const isAnimated =
            !!(stickerMsg.isAnimated || stickerMsg.isAvatar || stickerMsg.isLottie)
            || isAnimatedWebp(webpBuf);

        // Animated path — try MP4 via ffmpeg, fall back to raw animated webp as a document.
        if (isAnimated) {
            try {
                const mp4 = await webpToMp4(webpBuf);
                await sock.sendMessage(from, {
                    video: mp4,
                    mimetype: 'video/mp4',
                    caption: '🎞️ *Animated sticker → video*',
                    gifPlayback: true,
                }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
                return;
            } catch (e) {
                console.error('[toimg:mp4]', e.message);
                try {
                    await sock.sendMessage(from, {
                        document: webpBuf,
                        mimetype: 'image/webp',
                        fileName: 'sticker.webp',
                        caption: '⚠️ ffmpeg unavailable — sent as raw animated WebP.',
                    }, { quoted: msg });
                    await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } }).catch(() => {});
                } catch (_) {
                    await reply('❌ Failed to convert animated sticker.');
                }
                return;
            }
        }

        // Static path
        try {
            const jpeg = await webpToJpeg(webpBuf);
            await sock.sendMessage(from, {
                image: jpeg,
                caption: '🖼️ *Sticker → image*',
            }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (e) {
            console.error('[toimg:jpeg]', e.message);
            // Last-ditch: send the raw webp as image
            try {
                await sock.sendMessage(from, {
                    image: webpBuf,
                    caption: '🖼️ *Sticker → image* (raw)',
                }, { quoted: msg });
            } catch (_) {
                await reply('❌ Failed to convert sticker to image.');
            }
        }
    },
};

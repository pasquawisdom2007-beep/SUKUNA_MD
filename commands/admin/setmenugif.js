/**
 * setmenugif — Owner replies to a GIF and the bot saves it as the persistent
 * menu GIF at assets/menugif.mp4. Once set, .menu will send it with
 * gifPlayback:true so WhatsApp loops it continuously (silent, auto-replay).
 *
 * Accepts: GIF messages, video messages, and animated stickers (converted via ffmpeg).
 */
'use strict';

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

const GIF_PATH = path.resolve(__dirname, '..', '..', 'assets', 'menugif.mp4');

function tmp(ext) {
    return path.join(os.tmpdir(), `setmenugif-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
}
function run(cmd, ms = 45000) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: ms, maxBuffer: 50 * 1024 * 1024 }, (err, _so, se) =>
            err ? reject(new Error(se || err.message)) : resolve()
        );
    });
}
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

/**
 * Convert an animated webp sticker into an MP4 suitable for gifPlayback.
 * Strips audio, loops-friendly encoding, keeps it short.
 */
async function webpToMp4(webpBuf) {
    const inP  = tmp('.webp');
    const outP = tmp('.mp4');
    fs.writeFileSync(inP, webpBuf);
    try {
        await run(
            `ffmpeg -y -i "${inP}" -movflags +faststart ` +
            `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p" ` +
            `-c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 -an "${outP}"`
        );
        return fs.readFileSync(outP);
    } finally {
        try { fs.unlinkSync(inP); } catch {}
        try { fs.unlinkSync(outP); } catch {}
    }
}

/**
 * If the source is a real video (not a GIF), trim it to the first 6 seconds
 * so the looping gif stays snappy.
 */
async function trimVideo(rawBuf) {
    const inP  = tmp('.mp4');
    const outP = tmp('.out.mp4');
    fs.writeFileSync(inP, rawBuf);
    try {
        await run(
            `ffmpeg -y -i "${inP}" -t 6 -movflags +faststart ` +
            `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p" ` +
            `-c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 23 -an "${outP}"`
        );
        return fs.readFileSync(outP);
    } finally {
        try { fs.unlinkSync(inP); } catch {}
        try { fs.unlinkSync(outP); } catch {}
    }
}

module.exports = {
    name: 'setmenugif',
    aliases: ['setmenugif', 'menugif'],
    description: 'Reply to a GIF with .setmenugif to set it as the looping menu GIF',
    category: 'admin',

    async execute({ sock, msg, from, reply, isOwner }) {
        if (!isOwner) return reply('🔒 *Owner only* — only the bot owner can change the menu GIF.');

        const ctx    = msg.message?.extendedTextMessage?.contextInfo
                    || msg.message?.videoMessage?.contextInfo
                    || msg.message?.imageMessage?.contextInfo
                    || null;
        const quoted = ctx?.quotedMessage;

        // Detect GIF, video, or animated sticker
        const videoNode   = quoted?.videoMessage || msg.message?.videoMessage || null;
        const gifNode     = (quoted?.videoMessage?.gifPlayback && quoted.videoMessage) || null;
        const stickerNode = quoted?.stickerMessage || null;

        if (!videoNode && !gifNode && !stickerNode) {
            return reply(
                '🎬 *Set Menu GIF*\n\n' +
                'Reply to (or attach) a GIF with:\n' +
                '`.setmenugif`\n\n' +
                '✅ Supports: GIF messages, videos (auto-trimmed to 6s), and animated stickers.\n' +
                'The GIF will loop continuously when someone runs `.menu`.\n\n' +
                'Use `.resetmenugif` to remove it.'
            );
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        try {
            let buf;

            if (gifNode) {
                // It's a GIF — download as video, no trimming needed
                const stream = await downloadContentFromMessage(gifNode, 'video');
                buf = await streamToBuffer(stream);
            } else if (videoNode) {
                // Regular video — download and trim to 6s for looping
                const stream = await downloadContentFromMessage(videoNode, 'video');
                const raw    = await streamToBuffer(stream);
                if (!raw?.length) throw new Error('empty video buffer');
                buf = await trimVideo(raw);
            } else if (stickerNode) {
                // Animated sticker — convert to MP4
                const stream = await downloadContentFromMessage(stickerNode, 'sticker');
                const webp   = await streamToBuffer(stream);
                if (!webp?.length) throw new Error('empty sticker buffer');
                buf = await webpToMp4(webp);
            }

            if (!buf || buf.length < 200) throw new Error('empty GIF buffer');

            // Save as assets/menugif.mp4
            fs.mkdirSync(path.dirname(GIF_PATH), { recursive: true });
            fs.writeFileSync(GIF_PATH, buf);

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            await sock.sendMessage(from, {
                video:       { url: GIF_PATH },
                mimetype:    'video/mp4',
                gifPlayback: true,
                caption:
                    '✅ *Menu GIF updated!*\n\n' +
                    `📦 Saved as \`assets/menugif.mp4\` (${(buf.length / 1024 / 1024).toFixed(2)} MB)\n` +
                    'It will now loop continuously every time someone runs `.menu`\n' +
                    '_(unless a custom menu image is also set)._\n\n' +
                    '🔄 Playback: gifPlayback = true (loops silently)',
            }, { quoted: msg });
        } catch (e) {
            console.error('[setmenugif]', e.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply('❌ Failed to save menu GIF: ' + e.message);
        }
    }
};

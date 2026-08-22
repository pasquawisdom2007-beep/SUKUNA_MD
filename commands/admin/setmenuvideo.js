/**
 * setmenuvideo — Owner replies to a video (or attaches one with the command)
 * and the bot saves it as the persistent menu video at assets/menuvideo.mp4.
 * Once set, .menu will use it (if no custom menu image is set).
 *
 * Also accepts animated stickers / GIFs — they're converted with ffmpeg.
 */
'use strict';

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

const VIDEO_PATH = path.resolve(__dirname, '..', '..', 'assets', 'menuvideo.mp4');

function tmp(ext) {
    return path.join(os.tmpdir(), `setmenuvid-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
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

module.exports = {
    name: 'setmenuvideo',
    aliases: ['setmenuvid', 'menuvideo'],
    description: 'Reply to a video with .setmenuvideo to set it as the menu video',
    category: 'admin',

    async execute({ sock, msg, from, reply, isOwner }) {
        if (!isOwner) return reply('🔒 *Owner only* — only the bot owner can change the menu video.');

        const ctx    = msg.message?.extendedTextMessage?.contextInfo
                    || msg.message?.videoMessage?.contextInfo
                    || msg.message?.imageMessage?.contextInfo
                    || null;
        const quoted = ctx?.quotedMessage;

        const videoNode   = quoted?.videoMessage || msg.message?.videoMessage || null;
        const stickerNode = quoted?.stickerMessage || null;

        if (!videoNode && !stickerNode) {
            return reply(
                '🎬 *Set Menu Video*\n\n' +
                'Reply to (or attach) a video with:\n' +
                '`.setmenuvideo`\n\n' +
                'Animated stickers and GIFs are also accepted — they will be converted.\n\n' +
                'Use `.resetmenuvideo` to remove it.'
            );
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        try {
            let buf;
            if (videoNode) {
                const stream = await downloadContentFromMessage(videoNode, 'video');
                buf = await streamToBuffer(stream);
            } else {
                const stream = await downloadContentFromMessage(stickerNode, 'sticker');
                const webp   = await streamToBuffer(stream);
                if (!webp?.length) throw new Error('empty sticker buffer');
                buf = await webpToMp4(webp);
            }
            if (!buf || buf.length < 200) throw new Error('empty video buffer');

            fs.mkdirSync(path.dirname(VIDEO_PATH), { recursive: true });
            fs.writeFileSync(VIDEO_PATH, buf);

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            await sock.sendMessage(from, {
                video:    { url: VIDEO_PATH },
                mimetype: 'video/mp4',
                caption:
                    '✅ *Menu video updated!*\n\n' +
                    `📦 Saved as \`assets/menuvideo.mp4\` (${(buf.length/1024/1024).toFixed(2)} MB)\n` +
                    'It will now be sent every time someone runs `.menu`\n' +
                    '_(unless a custom menu image is also set)._',
            }, { quoted: msg });
        } catch (e) {
            console.error('[setmenuvideo]', e.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply('❌ Failed to save menu video: ' + e.message);
        }
    }
};

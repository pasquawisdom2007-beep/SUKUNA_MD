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
const { exec, execFile } = require('child_process');

const VIDEO_PATH = path.resolve(__dirname, '..', '..', 'assets', 'menuvideo.mp4');
const VIDEO_META_PATH = path.resolve(__dirname, '..', '..', 'assets', 'menuvideo.meta.json');

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
function probeVideo(filePath) {
    return new Promise(resolve => {
        execFile('/usr/bin/ffprobe', [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,codec_name:format=duration',
            '-of', 'json',
            filePath,
        ], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
            if (error) return resolve(null);
            try {
                const data = JSON.parse(stdout || '{}');
                const stream = data.streams?.[0] || {};
                return resolve({
                    width: Number(stream.width) || 0,
                    height: Number(stream.height) || 0,
                    codec: stream.codec_name || 'unknown',
                    duration: Number(data.format?.duration) || 0,
                });
            } catch (_) {
                return resolve(null);
            }
        });
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
            `-c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 -an "${outP}"`
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
            // Ordinary video uploads arrive here as bytes and are written
            // unchanged. This avoids introducing a second lossy encode.
            fs.writeFileSync(VIDEO_PATH, buf);
            const source = await probeVideo(VIDEO_PATH);
            try {
                if (source) fs.writeFileSync(VIDEO_META_PATH, JSON.stringify(source, null, 2));
                else if (fs.existsSync(VIDEO_META_PATH)) fs.unlinkSync(VIDEO_META_PATH);
            } catch (_) {}
            const sourceLabel = source
                ? `${source.width}×${source.height} · ${source.codec}${source.width >= 3840 && source.height >= 2160 ? ' · 4K source' : ' · source preserved'}`
                : 'original source bytes preserved';

            await sock.sendMessage(from, {
                video:    { url: VIDEO_PATH },
                mimetype: 'video/mp4',
                caption:
                    '✅ *Menu video updated!*\n\n' +
                    `📦 Saved as \`assets/menuvideo.mp4\` (${(buf.length/1024/1024).toFixed(2)} MB)\n` +
                    `📐 Source: ${sourceLabel}\n` +
                    'It will now be sent every time someone runs `.menu`\n' +
                    '_(unless a custom menu image is also set)._',
            }, { quoted: msg });
        } catch (e) {
            console.error('[setmenuvideo]', e.message);
            return reply('❌ Failed to save menu video: ' + e.message);
        }
    }
};

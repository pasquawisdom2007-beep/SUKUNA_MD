'use strict';

const { resolveMedia, downloadResolvedMedia, runFfmpeg } = require('../../utils/mediaCommand');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

module.exports = {
    name: 'mediafix',
    aliases: ['repairmedia', 'reencode'],
    description: 'Repair and re-encode replied media into a playable format',
    usage: '.mediafix (reply to image, video, audio, or sticker)',
    category: 'media',

    async execute({ sock, msg, from, reply, prefix }) {
        const px = prefixOf(prefix);
        const found = resolveMedia(msg);
        if (!found || !['image', 'video', 'audio', 'sticker'].includes(found.type)) {
            return reply(`🛠️ *Media Fix*\n\nReply to an image, video, audio, or sticker with ${px}mediafix.`);
        }
        try {
            const media = await downloadResolvedMedia(sock, msg, found);
            if (found.type === 'audio') {
                const audio = await runFfmpeg([
                    '-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000',
                    '-f', 'ogg', 'pipe:1',
                ], media.buffer, { timeout: 60_000, maxOutputBytes: 15 * 1024 * 1024 });
                return sock.sendMessage(from, {
                    audio,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: Boolean(media.node?.ptt),
                    caption: '🛠️ *Media repaired* · audio',
                }, { quoted: msg });
            }
            if (found.type === 'video') {
                const video = await runFfmpeg([
                    '-i', 'pipe:0',
                    '-map', '0:v:0', '-map', '0:a?',
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
                    '-c:a', 'aac', '-b:a', '128k',
                    '-movflags', 'frag_keyframe+empty_moov',
                    '-f', 'mp4', 'pipe:1',
                ], media.buffer, { timeout: 90_000, maxOutputBytes: 45 * 1024 * 1024 });
                return sock.sendMessage(from, {
                    video,
                    mimetype: 'video/mp4',
                    caption: '🛠️ *Media repaired* · video',
                }, { quoted: msg });
            }
            const image = await runFfmpeg([
                '-i', 'pipe:0', '-frames:v', '1', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2pipe', 'pipe:1',
            ], media.buffer, { timeout: 45_000, maxOutputBytes: 12 * 1024 * 1024 });
            return sock.sendMessage(from, {
                image,
                mimetype: 'image/jpeg',
                caption: `🛠️ *Media repaired* · ${found.type === 'sticker' ? 'sticker' : 'image'}`,
            }, { quoted: msg });
        } catch (error) {
            console.error('[mediafix]', error.message);
            return reply(`❌ Media repair failed: ${truncate(error.message, 300)}`);
        }
    },
};

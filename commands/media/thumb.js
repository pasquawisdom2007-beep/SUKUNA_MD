'use strict';

const { resolveMedia, downloadResolvedMedia, runFfmpeg } = require('../../utils/mediaCommand');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

module.exports = {
    name: 'thumb',
    aliases: ['thumbnail', 'videothumb'],
    description: 'Create a clean thumbnail from a replied image or video',
    usage: '.thumb (reply to an image or video)',
    category: 'media',

    async execute({ sock, msg, from, reply, prefix }) {
        const px = prefixOf(prefix);
        const found = resolveMedia(msg);
        if (!found || !['image', 'video'].includes(found.type)) {
            return reply(`🖼️ *Thumbnail*\n\nReply to an image or video with ${px}thumb.`);
        }
        try {
            const media = await downloadResolvedMedia(sock, msg, found);
            const image = await runFfmpeg([
                '-i', 'pipe:0', '-frames:v', '1',
                '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black',
                '-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2pipe', 'pipe:1',
            ], media.buffer, { timeout: 60_000, maxOutputBytes: 8 * 1024 * 1024 });
            return sock.sendMessage(from, {
                image,
                mimetype: 'image/jpeg',
                caption: `🖼️ *Thumbnail* · ${found.type}`,
            }, { quoted: msg });
        } catch (error) {
            console.error('[thumb]', error.message);
            return reply(`❌ Thumbnail failed: ${truncate(error.message, 280)}`);
        }
    },
};

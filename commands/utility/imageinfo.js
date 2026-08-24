'use strict';

const sharp = require('sharp');
const { resolveMedia, downloadResolvedMedia } = require('../../utils/mediaCommand');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

module.exports = {
    name: 'imageinfo',
    aliases: ['imginfo', 'mediainfo'],
    description: 'Inspect safe technical metadata for a replied image or sticker',
    usage: '.imageinfo (reply to an image or sticker)',
    category: 'utility',

    async execute({ sock, msg, reply, prefix }) {
        const px = prefixOf(prefix);
        const found = resolveMedia(msg);
        if (!found || !['image', 'sticker'].includes(found.type)) {
            return reply(`🖼️ *Image Info*\n\nReply to an image or sticker with ${px}imageinfo.`);
        }
        try {
            const media = await downloadResolvedMedia(sock, msg, found);
            const metadata = await sharp(media.buffer, { animated: true }).metadata();
            const pages = metadata.pages || 1;
            const lines = [
                '🖼️ *Image Info*',
                `Format: ${metadata.format || 'unknown'}`,
                `Dimensions: ${metadata.width || '?'} × ${metadata.pageHeight || metadata.height || '?'} px`,
                `Frames: ${pages}${pages > 1 ? ' (animated)' : ' (static)'}`,
                `Channels: ${metadata.channels || 'unknown'}`,
                `Color space: ${metadata.space || 'unknown'}`,
                `File size: ${(media.buffer.length / 1024).toFixed(1)} KB`,
                'Privacy: GPS and EXIF location fields are not displayed.',
            ];
            return reply(truncate(lines.join('\n'), 1800));
        } catch (error) {
            console.error('[imageinfo]', error.message);
            return reply(`❌ Could not inspect image: ${truncate(error.message, 250)}`);
        }
    },
};

'use strict';

const jsQR = require('jsqr');
const sharp = require('sharp');
const { resolveMedia, downloadResolvedMedia } = require('../../utils/mediaCommand');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

module.exports = {
    name: 'qrscan',
    aliases: ['readqr', 'decodeqr'],
    description: 'Scan a QR code from a replied image or sticker',
    usage: '.qrscan (reply to an image)',
    category: 'utility',

    async execute({ sock, msg, from, reply, prefix }) {
        const px = prefixOf(prefix);
        const found = resolveMedia(msg);
        if (!found || !['image', 'sticker'].includes(found.type)) {
            return reply(`🔍 *QR Scan*\n\nReply to an image or static sticker with ${px}qrscan.`);
        }
        try {
            const media = await downloadResolvedMedia(sock, msg, found);
            const decoded = await sharp(media.buffer)
                .rotate()
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            const result = jsQR(
                new Uint8ClampedArray(decoded.data),
                decoded.info.width,
                decoded.info.height,
                { inversionAttempts: 'attemptBoth' }
            );
            if (!result?.data) return reply('❌ No readable QR code was found in that image.');
            return reply(`✅ *QR Content*\n\n${truncate(result.data, 1800)}`);
        } catch (error) {
            console.error('[qrscan]', error.message);
            return reply(`❌ QR scan failed: ${truncate(error.message, 250)}`);
        }
    },
};

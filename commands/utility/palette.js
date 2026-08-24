'use strict';

const sharp = require('sharp');
const { resolveMedia, downloadResolvedMedia } = require('../../utils/mediaCommand');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

function toHex(value) {
    return `#${value.toString(16).padStart(2, '0')}`;
}

function dominantColors(data, channels, limit = 6) {
    const buckets = new Map();
    for (let i = 0; i < data.length; i += channels * 2) {
        const r = Math.round(data[i] / 16) * 16;
        const g = Math.round(data[i + 1] / 16) * 16;
        const b = Math.round(data[i + 2] / 16) * 16;
        const key = `${Math.min(r, 255)},${Math.min(g, 255)},${Math.min(b, 255)}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([key]) => key.split(',').map(Number));
}

module.exports = {
    name: 'palette',
    aliases: ['colors', 'colourpalette'],
    description: 'Extract the dominant colors from a replied image',
    usage: '.palette (reply to an image or sticker)',
    category: 'utility',

    async execute({ sock, msg, reply, prefix }) {
        const px = prefixOf(prefix);
        const found = resolveMedia(msg);
        if (!found || !['image', 'sticker'].includes(found.type)) {
            return reply(`🎨 *Palette*\n\nReply to an image or sticker with ${px}palette.`);
        }
        try {
            const media = await downloadResolvedMedia(sock, msg, found);
            const raw = await sharp(media.buffer)
                .resize({ width: 64, height: 64, fit: 'inside', withoutEnlargement: true })
                .flatten({ background: '#ffffff' })
                .removeAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            const colors = dominantColors(raw.data, raw.info.channels);
            if (!colors.length) return reply('❌ Could not extract colors from that image.');
            const lines = colors.map(([r, g, b], index) => {
                const hex = [r, g, b].map(toHex).join('');
                return `${index + 1}. ${hex}  RGB(${r}, ${g}, ${b})`;
            });
            return reply(truncate(`🎨 *Dominant Palette*\n\n${lines.join('\n')}`, 1200));
        } catch (error) {
            console.error('[palette]', error.message);
            return reply(`❌ Palette extraction failed: ${truncate(error.message, 250)}`);
        }
    },
};

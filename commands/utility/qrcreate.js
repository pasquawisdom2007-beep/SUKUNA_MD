'use strict';

const QRCode = require('qrcode');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

module.exports = {
    name: 'qrcreate',
    aliases: ['makeqr', 'qrimage'],
    description: 'Create a QR code locally from text or a URL',
    usage: '.qrcreate [--size 600] <text or URL>',
    category: 'utility',

    async execute({ sock, msg, from, reply, args, prefix }) {
        const px = prefixOf(prefix);
        const values = [...(args || [])];
        let size = 600;
        const sizeIndex = values.findIndex(value => value === '--size' || value === '-s');
        if (sizeIndex >= 0) {
            const requested = Number(values[sizeIndex + 1]);
            if (Number.isFinite(requested)) size = Math.min(Math.max(Math.round(requested), 180), 1200);
            values.splice(sizeIndex, 2);
        }
        const content = values.join(' ').trim();
        if (!content) return reply(`📱 *QR Create*\n\nUsage: ${px}qrcreate [--size 600] <text or URL>`);

        try {
            const image = await QRCode.toBuffer(content, {
                type: 'png',
                width: size,
                margin: 2,
                errorCorrectionLevel: 'M',
            });
            return sock.sendMessage(from, {
                image,
                caption: `📱 *QR Created*\nContent: ${truncate(content, 600)}\nSize: ${size}px`,
            }, { quoted: msg });
        } catch (error) {
            return reply(`❌ Could not create QR code: ${truncate(error.message, 250)}`);
        }
    },
};

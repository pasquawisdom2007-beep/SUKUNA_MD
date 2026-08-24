'use strict';

const crypto = require('crypto');
const { resolveMedia, downloadResolvedMedia } = require('../../utils/mediaCommand');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

const ALGORITHMS = new Set(['md5', 'sha1', 'sha256', 'sha512']);

module.exports = {
    name: 'hash',
    aliases: ['digest', 'checksum'],
    description: 'Generate a cryptographic hash for text or replied media',
    usage: '.hash [md5|sha1|sha256|sha512] <text or reply to media>',
    category: 'utility',

    async execute({ sock, msg, reply, args, prefix }) {
        const px = prefixOf(prefix);
        const values = [...(args || [])];
        let algorithm = 'sha256';
        if (ALGORITHMS.has(values[0]?.toLowerCase())) algorithm = values.shift().toLowerCase();
        const content = values.join(' ');
        try {
            let buffer;
            let source;
            if (content) {
                if (content.length > 100_000) return reply('❌ Text input is limited to 100,000 characters.');
                buffer = Buffer.from(content, 'utf8');
                source = 'text';
            } else {
                const found = resolveMedia(msg);
                if (!found) return reply(`🔐 *Hash*\n\nUsage: ${px}hash [sha256] <text>\nOr reply to media with ${px}hash sha256.`);
                const media = await downloadResolvedMedia(sock, msg, found);
                buffer = media.buffer;
                source = `${found.type} · ${buffer.length} bytes`;
            }
            const digest = crypto.createHash(algorithm).update(buffer).digest('hex');
            return reply(`🔐 *${algorithm.toUpperCase()}*\nSource: ${truncate(source, 120)}\n\`${digest}\``);
        } catch (error) {
            return reply(`❌ Hash failed: ${truncate(error.message, 260)}`);
        }
    },
};

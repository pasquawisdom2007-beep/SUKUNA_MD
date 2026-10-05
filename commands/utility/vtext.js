'use strict';

const MAX_TEXT_BYTES = 4096;

module.exports = {
    name: 'vtext',
    aliases: ['once', 'viewtext'],
    description: 'Send text as an experimental WhatsApp view-once message',
    category: 'utility',
    usage: '.vtext <text>',
    async execute({ sock, msg, from, args, reply }) {
        const text = args.join(' ').trim();
        if (!text) {
            return reply('👁️ Usage: `.vtext <text>`\n\nExample: `.vtext This text can be opened once`');
        }
        if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
            return reply(`⚠️ View-once text is limited to ${MAX_TEXT_BYTES} UTF-8 bytes.`);
        }

        try {
            if (typeof sock.sendViewOnceText === 'function') {
                await sock.sendViewOnceText(from, text, { quoted: msg });
            } else {
                // Compatibility fallback for a session that has not reloaded
                // the updated Pasqua Baileys fork yet.
                await sock.sendMessage(from, { text, viewOnce: true }, { quoted: msg });
            }
        } catch (error) {
            console.error('[VTEXT]', error.message);
            return reply('❌ WhatsApp could not send view-once text. This feature may require WhatsApp Beta on the receiving device.');
        }
    },
};

module.exports.MAX_TEXT_BYTES = MAX_TEXT_BYTES;

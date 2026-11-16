'use strict';

module.exports = {
    name: 'all',
    aliases: [],
    description: 'Use WhatsApp native admin-all mention in the current group (owner only).',
    usage: '.all',
    category: 'owner',
    ownerOnly: true,
    async execute({ sock, msg, from, reply, isGroup }) {
        if (!isGroup || !String(from || '').endsWith('@g.us')) {
            return reply('👥 *Sukuna:* This command can only be used in a group.');
        }
        try {
            await sock.sendMessage(from, {
                text: '@all',
                mentionAll: true,
            }, { quoted: msg });
        } catch (error) {
            return reply(`⊘ ${error?.message || error}`);
        }
    },
};

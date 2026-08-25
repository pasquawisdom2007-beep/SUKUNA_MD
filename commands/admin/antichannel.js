'use strict';

const database = require('../../utils/database');

module.exports = {
    name: 'antichannel',
    aliases: ['nochannel', 'nochannels', 'channelguard'],
    description: 'Delete WhatsApp Channel links and View Channel messages',
    category: 'admin',
    async execute({ reply, args, from, isGroup, isAdmin }) {
        if (!isGroup) return reply('👥 This command can only be used in groups.');
        if (!isAdmin) return reply('🛡️ *Admin Only!*\n\nOnly group admins can configure antichannel.');

        const action = String(args?.[0] || '').toLowerCase();
        const group = database.getGroup(from);

        if (!action || !['on', 'off', 'status'].includes(action)) {
            return reply(
                '📣 *Anti-Channel Protection*\n\n' +
                `Status: ${group.antichannel ? '✅ ON' : '❌ OFF'}\n\n` +
                '*Usage:*\n' +
                '• `.antichannel on` — Enable protection\n' +
                '• `.antichannel off` — Disable protection\n' +
                '• `.antichannel status` — Show current status\n\n' +
                '*Detects:*\n' +
                '✓ `whatsapp.com/channel/...` links\n' +
                '✓ Channel invite variants\n' +
                '✓ Newsletter/channel JIDs\n' +
                '✓ Hidden View Channel rich-preview metadata\n\n' +
                'Admins and the bot owner are exempt.'
            );
        }

        if (action === 'status') {
            return reply(
                '📣 *Anti-Channel Status*\n\n' +
                `Protection: ${group.antichannel ? '✅ Enabled' : '❌ Disabled'}\n` +
                'Scope: WhatsApp Channel links and View Channel messages\n' +
                'Admins: Exempt'
            );
        }

        const enabled = action === 'on';
        database.setGroup(from, 'antichannel', enabled);
        return reply(
            enabled
                ? '✅ *Anti-Channel Enabled*\n\nChannel links and View Channel messages from non-admins will be deleted.'
                : '❌ *Anti-Channel Disabled*'
        );
    },
};

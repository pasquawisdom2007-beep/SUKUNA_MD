'use strict';

module.exports = {
    name: 'sreact',
    aliases: ['stickerreact', 'stickerreaction'],
    description: 'Enable or disable Sukuna sticker reactions to incoming messages in this chat.',
    usage: '.sreact on|off|status',
    category: 'admin',

    async execute({ args, reply, from, isGroup, isAdmin, isOwner, database }) {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('🛡️ *Admin only.* A group admin must configure sticker reactions.');
        }
        if (!isGroup && !isOwner) {
            return reply('🔒 *Owner only.* Only the bot owner can configure sticker reactions in a personal chat.');
        }

        const action = String(args?.[0] || 'status').toLowerCase();
        if (!['on', 'off', 'status'].includes(action)) {
            return reply(
                '🎴 *Sukuna Sticker Reaction usage*\n\n' +
                '.sreact on — react to incoming messages with the Sukuna sticker\n' +
                '.sreact off — disable sticker reactions in this chat\n' +
                '.sreact status — view the current setting'
            );
        }

        const enabled = database.getStickerReaction(from);
        if (action === 'status') {
            return reply(
                `🎴 *Sukuna Sticker Reaction*\n\n` +
                `Status: ${enabled ? '✅ ON' : '❌ OFF'}\n` +
                `Scope: ${isGroup ? 'this group' : 'this personal chat'}\n` +
                `_The reaction is linked directly to each incoming message._`
            );
        }

        const next = action === 'on';
        database.setStickerReaction(from, next);
        return reply(next
            ? '✅ *Sukuna sticker reactions enabled.* I will attach the configured sticker to incoming messages in this chat.'
            : '❌ *Sukuna sticker reactions disabled* for this chat.');
    },
};

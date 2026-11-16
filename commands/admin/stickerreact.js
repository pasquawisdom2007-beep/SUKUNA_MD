'use strict';

const {
    MAX_STICKER_REACTION_ATTEMPTS,
    parseReactionCount,
    getQuotedStickerMessage,
    saveStickerReactionMessage,
    sendStickerReaction,
} = require('../../utils/stickerReaction');

module.exports = {
    name: 'sreact',
    aliases: ['stickerreact', 'stickerreaction'],
    description: 'Enable or disable Sukuna sticker reactions in this chat.',
    usage: '.sreact on|off|status | reply to a message with .sreact [count]',
    category: 'admin',

    async execute({ args = [], reply, from, isGroup, isAdmin, isOwner, database, sock, m }) {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('🛡️ *Admin only.* A group admin must configure sticker reactions.');
        }
        if (!isGroup && !isOwner) {
            return reply('🔒 *Owner only.* Only the bot owner can configure sticker reactions in a personal chat.');
        }

        const action = String(args[0] || '').trim().toLowerCase();
        if (['on', 'off', 'status'].includes(action)) {
            const enabled = database.getStickerReaction(from);
            if (action === 'status') {
                return reply(
                    `🎴 *Sukuna Sticker Reaction*\n\n` +
                    `Status: ${enabled ? '✅ ON' : '❌ OFF'}\n` +
                    `Scope: ${isGroup ? 'this group' : 'this personal chat'}\n` +
                    `_Use .sreact [count] while replying to manually attach the sticker._`
                );
            }
            const next = action === 'on';
            database.setStickerReaction(from, next);
            return reply(next
                ? '✅ *Sukuna sticker reactions enabled.* I will attach the configured sticker to incoming messages in this chat.'
                : '❌ *Sukuna sticker reactions disabled* for this chat.');
        }

        if (action === 'add') {
            if (args.length !== 1 || !getQuotedStickerMessage(m?.quoted)) {
                return reply('Reply to a sticker and send .sreact add to save it as the new Sukuna reaction sticker.');
            }
            try {
                saveStickerReactionMessage(m.quoted);
                return reply('✅ New Sukuna reaction sticker saved.');
            } catch (error) {
                return reply(`Could not save that sticker reaction: ${error.message}`);
            }
        }

        const count = parseReactionCount(action);
        if (!count) {
            return reply(
                `🎴 *Sukuna Sticker Reaction usage*\n\n` +
                `.sreact on — enable automatic reactions\n` +
                `.sreact off — disable automatic reactions\n` +
                `.sreact status — view the current setting\n` +
                `.sreact add — save a replied-to sticker\n` +
                `.sreact [1-${MAX_STICKER_REACTION_ATTEMPTS}] — react to the replied-to message`
            );
        }

        const targetKey = m?.quoted?.key;
        if (!targetKey?.id) {
            return reply('↩️ Reply to the message you want to sticker-react to, then send .sreact [count].');
        }
        try {
            const sent = await sendStickerReaction(sock, from, targetKey, count);
            if (!sent) return reply('❌ Sticker reaction relay is unavailable on this connection.');
        } catch (error) {
            console.error('[SREACT]', error.message);
            return reply('❌ Sukuna could not send the sticker reaction in this chat.');
        }
    },
};

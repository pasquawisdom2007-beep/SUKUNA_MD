'use strict';

module.exports = {
    name: 'clearchat',
    aliases: ['clear', 'clr', 'wipe'],
    category: 'tools',
    desc: 'Clear this chat locally for the bot account',
    reactions: {
        start: '🧹',
        success: '✨'
    },

    async execute(context) {
        const { sock, from, msg, reply } = context || {};
        try {
            if (!sock || !from || !msg?.key?.id) {
                return reply?.('Unable to clear this chat: the current message key is unavailable.');
            }

            // WhatsApp requires a real message key and timestamp as the deletion
            // boundary. The old implementation fabricated an empty key, so it
            // silently did nothing. This removes the chat locally for this bot
            // account only; it cannot erase history from other participants.
            const boundary = makeBoundary(msg, from);

            // React before clearing. Do not send a success text afterward because
            // that would immediately recreate a message in the chat being cleared.
            try {
                await sock.sendMessage(from, { react: { text: '🧹', key: msg.key } });
            } catch (_) {
                // Reaction support is best-effort and must not block clearing.
            }

            if (typeof sock.chatModify !== 'function') {
                throw new Error('The active Baileys fork does not expose chatModify');
            }

            await sock.chatModify({
                delete: true,
                lastMessages: [boundary],
            }, from);

            console.log(`[clearchat] local chat history cleared for ${from}`);
            return;
        } catch (err) {
            console.error('[clearchat]', err?.message || err);
            return reply?.('❌ Could not clear this chat locally. The WhatsApp connection may not support local chat deletion.');
        }
    }
};

function makeBoundary(msg, from) {
    return {
        key: {
            ...msg.key,
            remoteJid: msg.key.remoteJid || from,
        },
        messageTimestamp: Number(msg.messageTimestamp || Math.floor(Date.now() / 1000)),
    };
}

module.exports._private = { makeBoundary };

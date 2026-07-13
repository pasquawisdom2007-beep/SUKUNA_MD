/**
 * .clear — Delete the bot's local chat history for the current chat
 *
 * Uses chatModify({ delete: true }) with the triggering message as the
 * lastMessages anchor. WhatsApp uses that key + timestamp to know which
 * chat to wipe on the bot's end.
 *
 * A 2-second delay is inserted after the call to give the WA server time
 * to process the delete before the success reply is sent.
 *
 * Only affects the bot's own local view. No one else is touched.
 * Works in groups and DMs. Owner only.
 *
 * Usage: .clear
 */

'use strict';

module.exports = {
    name:        'clear',
    aliases:     ['clearchat', 'clearmessages'],
    description: "Clear the bot's local chat history for this chat (owner only)",
    usage:       '.clear',
    category:    'owner',

    async execute({ sock, from, msg, sender, reply, isOwner, isGroup }) {
        if (!isOwner) return reply('🔒 _This command is reserved for the bot owner only._');

        try {
            // Build a fully-valid anchor. Baileys' chatModify throws if the
            // key is incomplete, if a group message that is not fromMe has no
            // participant, or if the timestamp is missing / non-numeric — any
            // of which silently broke this command. We normalise all three.
            const anchorKey = {
                remoteJid: from,
                id:        msg.key?.id,
                fromMe:    !!msg.key?.fromMe,
            };
            if (isGroup && !anchorKey.fromMe) {
                anchorKey.participant = msg.key?.participant || sender;
            }

            // Coerce the timestamp to a plain integer (it may arrive as a Long
            // object or be undefined).
            let ts = msg.messageTimestamp;
            if (ts && typeof ts === 'object' && typeof ts.toNumber === 'function') ts = ts.toNumber();
            ts = Number(ts);
            if (!ts || Number.isNaN(ts)) ts = Math.floor(Date.now() / 1000);

            const lastMessages = [{ key: anchorKey, messageTimestamp: ts }];

            // Try deleting the chat from the bot's view; if the fork/state
            // rejects a full delete, fall back to clearing its messages.
            try {
                await sock.chatModify({ delete: true, lastMessages }, from);
            } catch (delErr) {
                console.error('[CLEAR CMD] delete failed, trying clear:', delErr.message);
                await sock.chatModify({ clear: true, lastMessages }, from);
            }

            // Give WhatsApp server 2 s to process the delete before we reply.
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Also wipe the in-memory cache for this JID so the bot's own
            // anti-delete / retrieve store stays clean too.
            try {
                const sessionManager = require('../../lib/sessionManager');
                sessionManager._msgCache?.delete(from);
            } catch (_) {}

            const chatLabel = isGroup ? '👥 group' : '💬 DM';
            return reply(`🧹 *Chat cleared!*\n\n_All messages in this ${chatLabel} have been wiped from the bot's view._`);

        } catch (err) {
            console.error('[CLEAR CMD]', err.message);
            return reply(`❌ _Failed to clear chat: ${err.message}_`);
        }
    },
};

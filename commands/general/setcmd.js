/**
 * setcmd — Bind a bot command to a sticker.
 *
 * Usage: Reply to a sticker with  .setcmd <command>
 * Example: .setcmd ping
 *
 * Whenever anyone sends that sticker the bot executes the stored command.
 * Works ONLY when replying to a sticker — no sticker = no binding.
 */

'use strict';

const database     = require('../../utils/database');
const commandLoader = require('../../utils/commandLoader');
const { isEmojiOnly, quotedText, stickerHash: getStickerHash } = require('../../utils/customCommandTriggers');

module.exports = {
    name:        'setcmd',
    aliases:     ['stickercmd', 'bindcmd'],
    description: 'Bind a bot command to a sticker or emoji',
    usage:       '.setcmd <command>  (reply to a sticker or emoji)',
    // The dispatcher treats owner-category commands as owner/mod-only. This
    // protects the global binding registry while still allowing authorized
    // moderators to create bindings for the bot.
    category:    'owner',

    async execute({ sock, msg, from, reply, args }) {
        const commandName = args[0]?.toLowerCase().trim();
        if (!commandName) {
            return reply(
                '📌 *Set Sticker/Emoji Command*\n\n' +
                'Reply to a sticker or emoji, then type:\n' +
                '*.setcmd <command name>*\n\n' +
                'Every time that sticker or emoji is sent the bot will auto-run the command.\n\n' +
                '_Example:_ *.setcmd ping*\n' +
                '_Example:_ *.setcmd alive*\n\n' +
                'Use *.unsetcmd* (reply to the sticker or emoji) to remove.\n' +
                'Use *.cmdlist* to see all bindings.'
            );
        }

        // Verify the command exists in the bot
        const targetCmd = commandLoader.getCommand(commandName);
        if (!targetCmd) {
            return reply(
                '❌ Unknown command: *' + commandName + '*\n\n' +
                'Make sure you use a valid command name without the prefix.\n' +
                '_Example:_ `.setcmd ping` (not `.setcmd .ping`)'
            );
        }

        // ── Extract a sticker hash or emoji from the quoted message ───────────
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        if (!ctx) {
            return reply('❌ Please *reply to a sticker or emoji* with .setcmd <command>');
        }

        let stickerHash = null;
        let emojiKey = null;

        // Try inline quoted message first
        const inline = ctx?.quotedMessage?.stickerMessage;
        if (inline) {
            stickerHash = getStickerHash(inline);
        } else {
            const quotedEmoji = quotedText(ctx?.quotedMessage);
            if (isEmojiOnly(quotedEmoji)) emojiKey = quotedEmoji;
        }

        // Fall back to loading the full quoted message
        if (!stickerHash) {
            try {
                const loaded = await sock.loadMessage(ctx.remoteJid || from, ctx.stanzaId);
                const sd     = loaded?.message?.stickerMessage;
                if (sd) {
                    stickerHash = getStickerHash(sd);
                } else {
                    const loadedEmoji = quotedText(loaded?.message);
                    if (isEmojiOnly(loadedEmoji)) emojiKey = loadedEmoji;
                }
            } catch (_) {}
        }

        if (!stickerHash && !emojiKey) {
            return reply('❌ Reply to a sticker or emoji. Example: reply to ❤️ with .setcmd menu');
        }

        // ── Save to DB & confirm ─────────────────────────────────────────────
        const existing = stickerHash ? database.getGlobalStickerCmd(stickerHash) : database.getGlobalEmojiCmd(emojiKey);
        if (stickerHash) database.setGlobalStickerCmd(stickerHash, commandName);
        else database.setGlobalEmojiCmd(emojiKey, commandName);
        const target = stickerHash ? 'sticker' : `emoji ${emojiKey}`;

        if (existing) {
            reply(
                '✏️ *Custom Command Updated!*\n\n' +
                `Old: \`${existing}\`\n` +
                `New: \`${commandName}\`\n\n` +
                `Sending this ${target} will now trigger *.${commandName}*.`
            );
        } else {
            reply(
                '✅ *Custom Command Set!*\n\n' +
                `Command: \`.${commandName}\`\n\n` +
                `Whenever this ${target} is sent, the bot will automatically run *.${commandName}*.\n\n` +
                '_Use .unsetcmd (reply to the sticker or emoji) to remove it._'
            );
        }
    },
};

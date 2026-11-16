'use strict';

const fs = require('fs');
const path = require('path');
const { loadMentionSticker, sendMentionSticker, isWebp, isGzip } = require('../../utils/mentionSticker');

const SAVED_STICKER_DIR = path.join(process.cwd(), 'data');
const SAVED_STICKER_WEBP = path.join(SAVED_STICKER_DIR, 'mention-sticker.webp');
const SAVED_STICKER_Lottie = path.join(SAVED_STICKER_DIR, 'mention-sticker.lottie.gz');

async function saveQuotedSticker(quoted) {
    if (!quoted || typeof quoted.download !== 'function') {
        throw new Error('Reply to a sticker or provide a WebP/Lottie URL or file path.');
    }
    const buffer = await quoted.download();
    if (isWebp(buffer)) {
        await fs.promises.mkdir(SAVED_STICKER_DIR, { recursive: true });
        await fs.promises.writeFile(SAVED_STICKER_WEBP, buffer);
        return SAVED_STICKER_WEBP;
    }
    if (isGzip(buffer)) {
        await fs.promises.mkdir(SAVED_STICKER_DIR, { recursive: true });
        await fs.promises.writeFile(SAVED_STICKER_Lottie, buffer);
        return SAVED_STICKER_Lottie;
    }
    throw new Error('The replied file is not a WebP sticker or supported Lottie payload.');
}

module.exports = {
    name: 'mentionsticker',
    aliases: ['mstick', 'mentionstickerreact'],
    description: 'Send a configured sticker when someone is manually mentioned.',
    usage: '.mentionsticker set [URL/path] | reply to sticker and use .mentionsticker set | .mentionsticker on|off|status',
    category: 'owner',
    ownerOnly: true,

    async execute({ args = [], reply, database, phoneNumber, m, isOwner }) {
        if (!isOwner) return reply('🔒 *This command is reserved for the bot owner only.*');
        const current = database.getMentionSticker(phoneNumber);
        const action = String(args[0] || 'status').toLowerCase();

        if (action === 'status') {
            return reply(
                `🎴 *MENTION STICKER*\n\n` +
                `Status: ${current.enabled ? '✅ ON' : '❌ OFF'}\n` +
                `Sticker: ${current.source ? '✅ configured' : '❌ not configured'}\n\n` +
                `Reply to a sticker and use *.mentionsticker set*, or use *.mentionsticker set <URL/path>*.\n` +
                `Then use *.mentionsticker on* to reply when a user is manually mentioned.`
            );
        }

        if (action === 'off' || action === 'disable') {
            database.setMentionSticker(phoneNumber, { ...current, enabled: false });
            return reply('❌ *Mention sticker disabled.*');
        }

        if (action === 'clear') {
            database.setMentionSticker(phoneNumber, { enabled: false, source: '' });
            return reply('🗑️ *Mention sticker cleared and disabled.*');
        }

        if (action === 'set') {
            try {
                const source = args.slice(1).join(' ').trim() || await saveQuotedSticker(m?.quoted);
                await loadMentionSticker(source);
                database.setMentionSticker(phoneNumber, { enabled: true, source });
                return reply('✅ *Mention sticker saved and enabled.* I will send it when a user is manually mentioned.');
            } catch (error) {
                return reply(`❌ Could not set the mention sticker: ${error.message}`);
            }
        }

        if (action === 'on' || action === 'enable') {
            if (!current.source) return reply('⚠️ Set a sticker first with *.mentionsticker set* while replying to a sticker.');
            try {
                await loadMentionSticker(current.source);
                database.setMentionSticker(phoneNumber, { ...current, enabled: true });
                return reply('✅ *Mention sticker enabled.*');
            } catch (error) {
                return reply(`❌ The configured mention sticker is unavailable: ${error.message}`);
            }
        }

        return reply('Usage: *.mentionsticker set* (reply to sticker), *.mentionsticker on*, *.mentionsticker off*, or *.mentionsticker status*.');
    },

    async handleMentionStickerTag(sock, msg, from, ctx) {
        try {
            const { database, phoneNumber, mentionedJids = [] } = ctx;
            if (!mentionedJids.length) return false;
            const setting = database.getMentionSticker(phoneNumber);
            if (!setting?.enabled || !setting.source) return false;
            await sendMentionSticker(sock, from, setting.source);
            return true;
        } catch (error) {
            console.error('[MENTIONSTICKER]', error.message);
            return false;
        }
    },

    helpers: { saveQuotedSticker, SAVED_STICKER_WEBP, SAVED_STICKER_Lottie },
};

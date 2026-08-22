'use strict';
const { downloadMediaMessage } = require('@pasqua-baileys/baileys');

module.exports = {
    name: 'setownerpp',
    aliases: ['setmypp', 'setbotpp', 'setpp'],
    description: 'Change the bot profile picture (reply to an image)',
    category: 'owner',

    async execute({ sock, msg, from, reply, isOwner }) {
        if (!isOwner) return reply('❌ Only the bot owner can use this command.');

        const quoted  = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const target  = quoted || msg?.message;
        const hasImg  = target?.imageMessage;

        if (!hasImg) return reply('❌ Please reply to an image with .setownerpp');

        try {
            reply('⏳ Updating profile picture...');
            const buffer = await downloadMediaMessage(
                { message: target, key: msg.key },
                'buffer',
                {}
            );
            const botJid = sock.user?.id;
            await sock.updateProfilePicture(botJid, buffer);
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            reply(
                `╭─❒ ◈ 𝙎𝙐𝙆𝙐᳇𝘼 ❒\n` +
                `│ ✅ *Bot profile picture updated!*\n` +
                `╰─⛧ 𝓹𝓪𝓼𝓺𝓾𝓪 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭`
            );
        } catch (e) {
            console.error('[setownerpp]', e.message);
            reply('❌ Failed to update profile picture.');
        }
    },
};

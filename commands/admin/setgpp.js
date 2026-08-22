'use strict';
const { downloadMediaMessage } = require('@pasqua-baileys/baileys');

module.exports = {
    name: 'setgpp',
    aliases: ['setgrouppic', 'setgpic'],
    description: 'Set the group profile picture (reply to an image) — admin only',
    category: 'admin',

    async execute({ sock, msg, from, reply, isGroup, isAdmin }) {
        if (!isGroup) return reply('❌ This command is for groups only.');
        if (!isAdmin) return reply('🛑 Only group admins can change the group picture.');

        // Find the image — quoted message or the message itself
        const quoted  = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const target  = quoted || msg?.message;
        const imgType = target?.imageMessage ? 'imageMessage' : null;

        if (!imgType) return reply('❌ Please reply to an image with .setgpp');

        try {
            reply('⏳ Updating group picture...');
            const buffer = await downloadMediaMessage(
                { message: target, key: msg.key },
                'buffer',
                {}
            );
            await sock.updateProfilePicture(from, buffer);
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            reply(
                `╭─❒ ◈ 𝙎𝙐𝙆𝙐᳇𝘼 ❒\n` +
                `│ ✅ *Group picture updated!*\n` +
                `╰─⛧ 𝓹𝓪𝓼𝓺𝓾𝓪 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭`
            );
        } catch (e) {
            console.error('[setgpp]', e.message);
            reply('❌ Failed to update group picture.');
        }
    },
};

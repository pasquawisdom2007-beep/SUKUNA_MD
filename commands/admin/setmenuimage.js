/**
 * setmenuimage — Owner replies to an image with .setmenuimage to set it
 * as the bot's persistent menu image. Saved to assets/menuimage.jpg.
 * Once set, .menu sends that image (with caption + channel pill) instead
 * of the bundled video.
 */
'use strict';

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
const fs   = require('fs');
const path = require('path');

const IMAGE_PATH = path.resolve(__dirname, '..', '..', 'assets', 'menuimage.jpg');

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

module.exports = {
    name: 'setmenuimage',
    aliases: ['setmenuimg', 'menuimage', 'setmenu'],
    description: 'Reply to an image with .setmenuimage to set it as the menu image',
    category: 'admin',

    async execute({ sock, msg, from, reply, isOwner }) {
        if (!isOwner) return reply('🔒 *Owner only* — only the bot owner can change the menu image.');

        const ctx     = msg.message?.extendedTextMessage?.contextInfo;
        const quoted  = ctx?.quotedMessage;
        const imgNode = quoted?.imageMessage
            || msg.message?.imageMessage    // user attached image with caption ".setmenuimage"
            || null;

        if (!imgNode) {
            return reply(
                '🖼️ *Set Menu Image*\n\n' +
                'Send (or reply to) an image with:\n' +
                '`.setmenuimage`\n\n' +
                'The bot will save it and use it as the menu image from now on.\n\n' +
                'Use `.resetmenuimage` to remove it and fall back to the menu video.'
            );
        }

        try {
            const stream = await downloadContentFromMessage(imgNode, 'image');
            const buf    = await streamToBuffer(stream);
            if (!buf || buf.length < 100) throw new Error('empty image buffer');

            fs.mkdirSync(path.dirname(IMAGE_PATH), { recursive: true });
            fs.writeFileSync(IMAGE_PATH, buf);

            await sock.sendMessage(from, {
                image:   { url: IMAGE_PATH },
                caption:
                    '✅ *Menu image updated!*\n\n' +
                    `📦 Saved as \`assets/menuimage.jpg\` (${(buf.length/1024).toFixed(1)} KB)\n` +
                    'It will now be sent every time someone runs `.menu`.',
            }, { quoted: msg });
        } catch (e) {
            console.error('[setmenuimage]', e.message);
            return reply('❌ Failed to save menu image: ' + e.message);
        }
    }
};

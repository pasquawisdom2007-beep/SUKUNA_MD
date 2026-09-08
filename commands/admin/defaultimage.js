'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CUSTOM_MEDIA = [
    path.join(ROOT, 'assets', 'menuimage.jpg'),
    path.join(ROOT, 'assets', 'menuvideo.mp4'),
    path.join(ROOT, 'assets', 'menuvideo.meta.json'),
    path.join(ROOT, 'assets', 'menugif.mp4'),
];

module.exports = {
    name: 'defaultimage',
    aliases: ['usedefaultimage', 'restoredefaultimage'],
    description: 'Restore the built-in default menu image',
    category: 'admin',
    async execute({ reply, isOwner, args = [] }) {
        if (!isOwner) return reply('🔒 *Owner only* — only the bot owner can restore the default menu image.');
        const mode = String(args[0] || 'on').toLowerCase();
        if (!['on', 'enable', 'restore', 'default'].includes(mode)) {
            return reply('Usage: `.defaultimage on`\n\nThis removes custom menu image, video, and GIF files so `.menu` uses the built-in default image.');
        }
        let removed = 0;
        for (const file of CUSTOM_MEDIA) {
            try {
                if (fs.existsSync(file)) { fs.unlinkSync(file); removed++; }
            } catch (error) {
                return reply(`❌ Could not restore the default menu image: ${error.message}`);
            }
        }
        return reply([
            '✅ *Default menu image restored.*',
            '',
            '`.menu` will now use the built-in SUKUNA MD image.',
            removed ? `Removed ${removed} custom menu media file${removed === 1 ? '' : 's'}.` : 'No custom menu media was active.',
            '',
            'Set a custom image, video, or GIF again at any time with `.setmenuimage`, `.setmenuvideo`, or `.setmenugif`.',
        ].join('\n'));
    },
};

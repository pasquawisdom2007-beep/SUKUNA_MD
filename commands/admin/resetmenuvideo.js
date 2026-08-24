'use strict';
const fs   = require('fs');
const path = require('path');
const VIDEO_PATH = path.resolve(__dirname, '..', '..', 'assets', 'menuvideo.mp4');
const VIDEO_META_PATH = path.resolve(__dirname, '..', '..', 'assets', 'menuvideo.meta.json');

module.exports = {
    name: 'resetmenuvideo',
    aliases: ['clearmenuvideo', 'unsetmenuvideo'],
    description: 'Remove the custom menu video',
    category: 'admin',
    async execute({ reply, isOwner }) {
        if (!isOwner) return reply('🔒 *Owner only*');
        try {
            let removed = false;
            if (fs.existsSync(VIDEO_PATH)) {
                fs.unlinkSync(VIDEO_PATH);
                removed = true;
            }
            if (fs.existsSync(VIDEO_META_PATH)) {
                fs.unlinkSync(VIDEO_META_PATH);
                removed = true;
            }
            if (removed) return reply('🗑️ Menu video removed.');
            return reply('ℹ️ No custom menu video is set.');
        } catch (e) {
            return reply('❌ ' + e.message);
        }
    }
};

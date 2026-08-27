/**
 * Antiviewonce — Auto-reveals every view-once photo/video/audio sent in the group.
 *
 * Robust extractor mirrors commands/fun/vv.js behaviour (v1, v2, v2Extension).
 * Toggle: .antiviewonce
 * Admin only.
 */
'use strict';

const database = require('../../utils/database');

module.exports = {
    name: 'antiviewonce',
    aliases: ['antivv', 'autovv', 'avv'],
    description: 'Recover new view-once media from groups into the paired bot account\'s private chat',
    category: 'moderation',
    usage: '.antiviewonce',

    async execute({ from, isGroup, isAdmin, isOwner, reply }) {
        if (!isGroup)             return reply('👥 This command can only be used in groups!');
        if (!isAdmin && !isOwner) return reply('🛡️ *Admin Only!* You must be a group admin.');

        const grp     = database.getGroup(from);
        const current = !!grp.antiviewonce;
        const next    = !current;
        database.setGroup(from, 'antiviewonce', next);

        await reply(
            `👁️ *𝗔𝗡𝗧𝗜-𝗩𝗜𝗘𝗪𝗢𝗡𝗖𝗘* ⛧\n\n` +
            (next
                ? `✅ *ON* — _New view-once media will be recovered and sent to the paired bot account\'s private chat._`
                : `🔴 *OFF* — _View-once messages will pass through normally._`) +
            `\n\n> _Sukuna MD · Nothing stays hidden_`
        );
    },
};

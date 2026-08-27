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
    usage: '.antiviewonce [on|off]',

    async execute({ from, isGroup, isAdmin, isOwner, reply, args = [] }) {
        if (!isGroup)             return reply('👥 This command can only be used in groups!');
        if (!isAdmin && !isOwner) return reply('🛡️ *Admin Only!* You must be a group admin.');

        const grp     = database.getGroup(from);
        const current = !!grp.antiviewonce;
        const requested = String(args?.[0] || '').trim().toLowerCase();
        const next = requested === 'on' ? true
            : requested === 'off' ? false
            : !current;
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

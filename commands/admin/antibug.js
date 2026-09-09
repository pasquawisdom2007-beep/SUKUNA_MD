'use strict';

const database = require('../../utils/database');
const { limits } = require('../../utils/antibugEngine');

module.exports = {
    name: 'antibug',
    aliases: ['bugshield', 'payloadguard'],
    description: 'Protect groups from malformed messages and message floods.',
    usage: '.antibug on|off|status',
    category: 'admin',

    async execute({ reply, args, from, isGroup, isAdmin }) {
        if (!isGroup) return reply('👥 AntiBug is a group protection feature.');
        if (!isAdmin) return reply('🛡️ *Admin only.* You must be a group admin to configure AntiBug.');

        const action = String(args?.[0] || 'status').toLowerCase();
        const group = database.getGroup(from);
        if (!['on', 'off', 'status'].includes(action)) {
            return reply('🛡️ *AntiBug usage*\n\n.antibug on — enable protection\n.antibug off — disable protection\n.antibug status — view protection status');
        }

        if (action === 'status') {
            return reply(
                `🛡️ *AntiBug Status*\n\n` +
                `Protection: ${group.antibug !== false ? '✅ ON' : '❌ OFF'}\n` +
                `Scope: malformed message structures and rapid message floods\n` +
                `Group action: delete suspicious messages when possible\n` +
                `Limits: ${limits.MAX_DEPTH} nesting levels, ${limits.MAX_STRING_BYTES / 1024}KB strings, ${limits.RATE_LIMIT} messages/${limits.RATE_WINDOW_MS / 1000}s per sender\n\n` +
                `_AntiBug does not execute, decode, or forward suspicious payload content._`
            );
        }

        database.setGroup(from, 'antibug', action === 'on');
        return reply(action === 'on'
            ? '✅ *AntiBug enabled.* Suspicious malformed messages and sender floods will be screened before normal command processing.'
            : '❌ *AntiBug disabled* for this group.');
    },
};

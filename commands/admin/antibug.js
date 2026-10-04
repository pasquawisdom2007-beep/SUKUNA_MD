'use strict';

const database = require('../../utils/database');
const { limits } = require('../../utils/antibugEngine');

module.exports = {
    name: 'antibug',
    aliases: ['bugshield', 'payloadguard'],
    description: 'Protect groups and the bot account from malformed messages and message floods.',
    usage: '.antibug on|off|status  |  .antibug p on|off|status',
    category: 'admin',

    async execute({ reply, args, from, isGroup, isAdmin, isOwner, phoneNumber }) {
        const first = String(args?.[0] || 'status').toLowerCase();
        const personal = first === 'p' || first === 'personal';

        if (personal) {
            if (!isOwner) return reply('🛡️ *Owner only.* Personal AntiBug protects the bot account and can only be changed by the owner.');
            const action = String(args?.[1] || 'status').toLowerCase();
            if (!['on', 'off', 'status'].includes(action)) {
                return reply('🛡️ *Personal AntiBug usage*\n\n.antibug p on — protect the bot in personal chats\n.antibug p off — disable personal protection\n.antibug p status — view personal protection status');
            }
            const enabled = database.getAntiBugPersonal(phoneNumber);
            if (action === 'status') {
                return reply(
                    `🛡️ *Personal AntiBug Status*\n\n` +
                    `Protection: ${enabled ? '✅ ON' : '❌ OFF'}\n` +
                    `Scope: direct messages received by this bot account\n` +
                    `Action: remove suspicious messages from the bot view, locally clear flood ranges, and report safely to the owner DM\n\n` +
                    `_The bot never executes, decodes, forwards, or includes suspicious payload content in reports._`
                );
            }
            database.setAntiBugPersonal(phoneNumber, action === 'on');
            return reply(action === 'on'
                ? '✅ *Personal AntiBug enabled.* Suspicious direct-message structures and floods will be contained locally and reported to the owner DM.'
                : '❌ *Personal AntiBug disabled* for this bot session.');
        }

        if (!isGroup) return reply('👥 Group AntiBug is configured inside groups. For the bot account, use `.antibug p on|off|status`.');
        if (!isAdmin && !isOwner) return reply('🛡️ *Admin only.* You must be a group admin to configure Group AntiBug.');

        const action = first;
        const group = database.getGroup(from);
        if (!['on', 'off', 'status'].includes(action)) {
            return reply('🛡️ *AntiBug usage*\n\n.antibug on — enable group protection\n.antibug off — disable group protection\n.antibug status — view protection status\n.antibug p on — enable personal bot-account protection');
        }

        if (action === 'status') {
            return reply(
                `🛡️ *Group AntiBug Status*\n\n` +
                `Protection: ${group.antibug !== false ? '✅ ON' : '❌ OFF'}\n` +
                `Scope: malformed message structures and rapid message floods\n` +
                `Group action: remove suspicious messages from the bot view only\n` +
                `Limits: ${limits.MAX_DEPTH} nesting levels, ${limits.MAX_STRING_BYTES / 1024}KB strings, ${limits.RATE_LIMIT} messages/${limits.RATE_WINDOW_MS / 1000}s per sender\n\n` +
                `_Suspicious payload content is never executed, decoded, forwarded, or copied into reports._`
            );
        }

        database.setGroup(from, 'antibug', action === 'on');
        return reply(action === 'on'
            ? '✅ *Group AntiBug enabled.* Suspicious malformed messages and sender floods will be screened before normal processing and removed from the bot view only.'
            : '❌ *Group AntiBug disabled* for this group.');
    },
};

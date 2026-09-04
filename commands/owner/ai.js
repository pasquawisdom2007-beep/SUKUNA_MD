'use strict';

/**
 * Pasqua Baileys AI badge control.
 * Usage: .ai badge on | .ai badge off | .ai badge status
 */
module.exports = {
    name: 'ai',
    aliases: ['aibadge', 'aibadgecontrol'],
    description: 'Show the Pasqua Baileys AI badge on private-DM messages',
    usage: '.ai badge on|off|status',
    category: 'owner',
    ownerOnly: true,

    async execute({ args, reply, database }) {
        const action = String(args[0] || '').toLowerCase();
        const value = String(args[1] || '').toLowerCase();
        const requested = action === 'badge' ? value : action;

        if (!['on', 'off', 'status'].includes(requested)) {
            return reply('Usage: *.ai badge on* | *.ai badge off* | *.ai badge status*');
        }
        if (requested === 'status') {
            return reply(`🤖 *AI badge:* ${database.getAIBadge() ? 'ON' : 'OFF'}\n_Private-DM messages only._`);
        }

        const enabled = requested === 'on';
        database.setAIBadge(enabled);
        return reply(
            `${enabled ? '✅' : '❌'} *AI badge ${enabled ? 'enabled' : 'disabled'}.*\n` +
            `${enabled ? 'Private-DM messages will carry the small Pasqua AI badge.' : 'New private-DM messages will no longer carry the AI badge.'}\n` +
            `_Groups and status messages are never changed._`
        );
    },
};

'use strict';
module.exports = {
    name: 'console',
    aliases: ['consolelog', 'logs'],
    description: 'Toggle colorful incoming-message console logs',
    usage: '.console on|off|status',
    category: 'owner',
    ownerOnly: true,
    async execute({ args = [], reply, database, phoneNumber, isOwner, isMod }) {
        if (!isOwner && !isMod) return reply('🔒 Only the owner or an authorized moderator can change console logging.');
        const action = String(args[0] || 'status').toLowerCase();
        if (action === 'status') return reply(`🖥️ *CONSOLE LOGS*\n\nStatus: *${database.getConsoleLogs(phoneNumber) ? 'ON' : 'OFF'}*\n\nUse *.console on* or *.console off*.`);
        if (!['on', 'off', 'enable', 'disable'].includes(action)) return reply('Usage: `.console on`, `.console off`, or `.console status`');
        const enabled = action === 'on' || action === 'enable';
        database.setConsoleLogs(phoneNumber, enabled);
        return reply(`${enabled ? '✅' : '❌'} *Console logs ${enabled ? 'enabled' : 'disabled'}.*`);
    },
};

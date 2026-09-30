/**
 * AntiForward Command — Toggle anti-forwarded message protection
 * Usage: .antiforward on | .antiforward off | .antiforward status
 */
const database = require('../../utils/database');
module.exports = {
    name: 'antiforward',
    aliases: ['noforward', 'antifwd', 'antifoward'],
    description: 'Toggle deletion of forwarded messages in the group',
    category: 'moderation',
    async execute({ reply, args, from, isGroup, isAdmin, isOwner }) {
        if (!isGroup) return reply('👥 This command can only be used in groups!');
        if (!isAdmin && !isOwner) return reply('🛡️ *Admin only.* Only group admins can configure AntiForward.');
        const state = args[0]?.toLowerCase();
        const current = database.getGroup(from).antiforward === true;
        if (!state || !['on', 'off', 'status'].includes(state)) {
            return reply(`📨 *Anti-Forward*\n\nStatus: ${current ? '✅ ON' : '❌ OFF'}\n\nUsage:\n• .antiforward on\n• .antiforward off\n• .antiforward status\n\nWhen ON, forwarded messages from non-admins are deleted, including wrapped/hidden forwards.`);
        }
        if (state === 'status') return reply(`📨 *Anti-Forward status*\n\nProtection: ${current ? '✅ Enabled' : '❌ Disabled'}\nScope: recursively detected forwarded messages\nExempt: group admins, owner, and this bot`);
        const enabled = state === 'on';
        database.setGroupData(from, 'antiforward', enabled);
        return reply(`📨 *Anti-Forward ${enabled ? 'Enabled ✅' : 'Disabled ❌'}*\n\n${enabled ? 'Forwarded messages will now be automatically deleted.' : 'Forwarded messages are now allowed.'}`);
    }
};

'use strict';

function numberOf(jid) {
    return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '') || 'unknown';
}

function addCount(map, jid, value) {
    const key = numberOf(jid);
    map.set(key, (map.get(key) || 0) + (Number(value) || 0));
}

module.exports = {
    name: 'modreport',
    aliases: ['moderationreport', 'modstats', 'moderationstats'],
    description: 'Show a compact moderation and activity report for the current group',
    category: 'admin',
    groupOnly: true,

    async execute({ reply, from, isAdmin, isOwner, database }) {
        if (!isAdmin && !isOwner) {
            return reply('🛡️ *Admin only* — this report is available to group administrators.');
        }

        const group = database.getGroup(from);
        const warnings = database.data.warnings?.[from] || {};
        const warningTotals = new Map();
        for (const [jid, value] of Object.entries(warnings)) addCount(warningTotals, jid, value);

        const linkWarnings = group.antilinkWarnings || {};
        for (const [jid, value] of Object.entries(linkWarnings)) {
            addCount(warningTotals, jid, typeof value === 'object' ? value.count : value);
        }

        const mentionWarnings = group.antimentionWarnings || {};
        for (const [jid, value] of Object.entries(mentionWarnings)) addCount(warningTotals, jid, value);

        const mutes = database.getMutedUsers(from);
        const activity = database.getAllUserActivity(from);
        const topActivity = Object.entries(activity)
            .map(([jid, value]) => ({
                jid,
                count: typeof value === 'object' ? Number(value.msgCount || 0) : 0,
                lastSeen: typeof value === 'object' ? Number(value.lastSeen || 0) : Number(value || 0),
            }))
            .filter(row => row.count > 0 || row.lastSeen > 0)
            .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
            .slice(0, 5);

        const topWarnings = [...warningTotals.entries()]
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const formatRows = (rows, formatter, empty) => rows.length ? rows.map(formatter) : [empty];
        const lines = [
            '╔══════════════════════════╗',
            '║       MOD REPORT         ║',
            '╚══════════════════════════╝',
            '',
            `Group       : ${from}`,
            `Anti-link   : ${group.antilink ? 'ON' : 'OFF'}`,
            `Anti-spam   : ${group.antispam?.enabled || group.antispam === true ? 'ON' : 'OFF'}`,
            `Anti-mention: ${group.antimention ? 'ON' : 'OFF'}`,
            `Active mutes: ${Object.keys(mutes).length}`,
            '',
            'TOP WARNINGS',
            ...formatRows(topWarnings, ([jid, count], index) => `${index + 1}. @${jid} — ${count}`, 'No warnings recorded'),
            '',
            'TOP ACTIVITY',
            ...formatRows(topActivity, (row, index) => `${index + 1}. @${numberOf(row.jid)} — ${row.count} messages`, 'No message activity recorded'),
            '',
            `Tracked users: ${Object.keys(activity).length}`,
            `Total warnings: ${[...warningTotals.values()].reduce((sum, value) => sum + value, 0)}`,
            '_Report is read-only and uses the bot’s local moderation database._',
        ];

        return reply(lines.join('\n'));
    },
};

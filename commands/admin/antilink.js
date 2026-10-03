/**
 * AntiLink Command — link protection with a configurable warning system.
 * Usage: .antilink on/off/strict/status/warn <number>
 */

const database = require('../../utils/database');

function warningTotal(warnings) {
    return Object.values(warnings || {}).reduce((total, entry) =>
        total + (typeof entry === 'object' ? Number(entry.count || 0) : Number(entry || 0)), 0);
}

function maxWarnings(group) {
    const value = Number(group?.antilinkMaxWarnings);
    return Number.isInteger(value) && value >= 1 && value <= 20 ? value : 3;
}

function statusText(group, totalWarnings) {
    const limit = maxWarnings(group);
    return (
        `🔗 *Anti-Link Status*\n\n` +
        `Status: ${group.antilink ? (group.antilinkMode === 'strict' ? '🔴 STRICT' : '✅ ON') : '❌ OFF'}\n` +
        `Mode: ${group.antilinkMode || 'normal'}\n` +
        `Action: ${(group.antilinkAction || 'kick').toUpperCase()}\n` +
        `Warnings before action: ${limit}\n` +
        `Total Violations: ${totalWarnings}\n` +
        `Warning Cooldown: ${group.antilinkCooldown || 24} hours\n\n` +
        `Use *.antilink warn <number>* to change the limit.\n` +
        `Allowed limit: *1–20 warnings*.`
    );
}

module.exports = {
    name: 'antilink',
    aliases: ['nolink', 'antilinks'],
    description: 'Enable/disable link protection and configure warning kicks',
    category: 'admin',

    async execute({ reply, args, from, isGroup, isAdmin }) {
        if (!isGroup) return reply('👥 This command can only be used in groups!');
        if (!isAdmin) {
            return reply('🛡️ *Admin Only!*\n\n❌ You must be a group admin to use this command.');
        }

        const action = String(args[0] || '').toLowerCase().trim();
        const group = database.getGroup(from);

        if (!action) {
            const limit = maxWarnings(group);
            return reply(
                `🔗 *Anti-Link Settings*\n\n` +
                statusText(group, warningTotal(group.antilinkWarnings)) + `\n\n` +
                `*Usage:*\n` +
                `• .antilink on — Enable warn → kick\n` +
                `• .antilink off — Disable\n` +
                `• .antilink warn 2 — Kick after 2 warnings\n` +
                `• .antilink status — Show settings\n` +
                `• .antilink strict — Kick on the first violation\n` +
                `• .antilink mute — Mute after the warning limit\n` +
                `• .antilink delete — Delete links only\n\n` +
                `Default: *${limit === 3 ? 3 : limit} warnings*, then kick.`
            );
        }

        if (action === 'status') {
            return reply(statusText(group, warningTotal(group.antilinkWarnings)));
        }

        if (action === 'warn') {
            const threshold = Number(args[1]);
            if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) {
                return reply(
                    `❌ *Invalid warning limit.*\n\n` +
                    `Use a whole number from *1* to *20*.\n` +
                    `Example: .antilink warn 2`
                );
            }
            database.setGroup(from, 'antilinkMaxWarnings', threshold);
            database.setGroup(from, 'antilinkAction', 'kick');
            database.setGroup(from, 'antilink', true);
            database.setGroup(from, 'antilinkMode', 'normal');
            return reply(
                `✅ *Anti-Link Warning Limit Updated*\n\n` +
                `Users will be warned *${threshold}* time${threshold === 1 ? '' : 's'} and then kicked.\n` +
                `Links will be deleted on every violation.`
            );
        }

        if (action === 'on') {
            database.setGroup(from, 'antilink', true);
            database.setGroup(from, 'antilinkMode', 'normal');
            database.setGroup(from, 'antilinkAction', 'kick');
            if (!Number.isInteger(Number(group.antilinkMaxWarnings))) {
                database.setGroup(from, 'antilinkMaxWarnings', 3);
            }
            database.setGroup(from, 'antilinkCooldown', 24);
            const limit = maxWarnings(database.getGroup(from));
            return reply(
                `✅ *Anti-Link Enabled*\n\n` +
                `Mode: Normal\n` +
                `Action: Warn → Kick after ${limit} warning${limit === 1 ? '' : 's'}\n` +
                `Cooldown: 24 hours\n\n` +
                `Links will be deleted and users warned.`
            );
        }

        if (action === 'off') {
            database.setGroup(from, 'antilink', false);
            database.setGroup(from, 'antilinkMode', 'off');
            return reply('❌ *Anti-Link Disabled*');
        }

        if (action === 'strict') {
            database.setGroup(from, 'antilink', true);
            database.setGroup(from, 'antilinkMode', 'strict');
            database.setGroup(from, 'antilinkAction', 'kick');
            return reply(
                `🔴 *Anti-Link Strict Mode*\n\n` +
                `Links are deleted and the user is kicked on the *first violation*.\n` +
                `Use .antilink on for the warning mode.`
            );
        }

        if (['delete', 'kick', 'mute'].includes(action)) {
            database.setGroup(from, 'antilink', true);
            database.setGroup(from, 'antilinkMode', 'normal');
            database.setGroup(from, 'antilinkAction', action);
            return reply(
                `✅ *Anti-Link Action Updated*\n\n` +
                `Action: ${action.toUpperCase()} after ${maxWarnings(group)} warning${maxWarnings(group) === 1 ? '' : 's'}.`
            );
        }

        return reply(
            `❌ Unknown option: *${action}*\n\n` +
            `Use .antilink, .antilink on, .antilink off, .antilink warn 2, or .antilink status.`
        );
    }
};

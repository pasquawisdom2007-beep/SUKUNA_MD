'use strict';

const BADGE = ' ☑️';

function cleanName(name) {
    return String(name || '')
        .replace(/\s*(?:☑️|☑|✅|✓|✔️|✔|🔵)\s*$/u, '')
        .trim();
}

function decoratedName(name) {
    const base = cleanName(name).slice(0, 128 - BADGE.length).trim();
    return `${base}${BADGE}`;
}

module.exports = {
    name: 'verifiedname',
    aliases: ['namebadge', 'profilebadge', 'bluecheckname'],
    description: 'Add or remove a visible check-style mark from the bot name',
    usage: '.verifiedname on | off | status',
    category: 'owner',

    async execute({ sock, args, reply, isOwner }) {
        if (!isOwner) return reply('❌ Only the bot owner can use this command.');

        const action = String(args?.[0] || 'status').toLowerCase();
        if (!['on', 'off', 'status'].includes(action)) {
            return reply('❌ Usage: *.verifiedname on* | *.verifiedname off* | *.verifiedname status*');
        }

        const current = String(sock.user?.name || '').trim();
        if (!current) return reply('❌ I could not read the bot’s current WhatsApp profile name.');

        if (action === 'status') {
            return reply(
                `🏷️ *Profile name badge:* ${/☑️|☑|✅|✓|✔️|✔|🔵$/u.test(current) ? 'ON' : 'OFF'}\n` +
                `👤 *Current name:* ${current}`
            );
        }

        const next = action === 'on' ? decoratedName(current) : cleanName(current);
        if (next === current) {
            return reply(action === 'on'
                ? `✅ The visible name badge is already enabled:\n*${current}*`
                : `✅ The visible name badge is already removed:\n*${current}*`);
        }

        try {
            await sock.updateProfileName(next);
            // Keep the in-memory profile aligned for subsequent status calls.
            if (sock.user && typeof sock.user === 'object') sock.user.name = next;
            return reply(
                action === 'on'
                    ? `✅ *Visible name badge enabled.*\n\nNew name: *${next}*\n\n_This is a visual Unicode mark, not Meta’s official verification badge._`
                    : `✅ *Visible name badge removed.*\n\nRestored name: *${next}*`
            );
        } catch (error) {
            console.error('[verifiedname]', error);
            return reply(`❌ Failed to update the WhatsApp profile name.\n_${error.message}_`);
        }
    },
};

module.exports.BADGE = BADGE;
module.exports.cleanName = cleanName;
module.exports.decoratedName = decoratedName;

'use strict';

const database = require('../../utils/database');

module.exports = {
    name: 'alo',
    aliases: ['alwaysonline', 'always-online'],
    description: 'Keep the bot presence available while its WhatsApp session is connected',
    usage: '.alo [on|off]',
    category: 'owner',
    ownerOnly: true,

    async execute({ sock, phoneNumber, args, reply }) {
        const pn = phoneNumber || (sock.user?.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
        if (!pn) return reply('❌ Could not identify this bot session.');

        const option = String(args[0] || '').toLowerCase();
        if (!option) {
            const enabled = database.getAlwaysOnline(pn);
            return reply(
                `🟢 *Always Online*\n\n` +
                `Status: ${enabled ? '✅ *ON*' : '❌ *OFF*'}\n\n` +
                `When enabled, the connected bot session periodically advertises *available* presence.\n` +
                `This is separate from \.autoread and does not mark messages as read.\n\n` +
                `Use \.alo on or \.alo off.`
            );
        }

        const enabled = ['on', 'enable', '1', 'true'].includes(option);
        const disabled = ['off', 'disable', '0', 'false'].includes(option);
        if (!enabled && !disabled) return reply('Usage: `.alo on` or `.alo off`');

        database.setAlwaysOnline(pn, enabled);
        if (typeof sock.__sukunaRefreshAlwaysOnline === 'function') {
            await sock.__sukunaRefreshAlwaysOnline();
        } else if (enabled && typeof sock.sendPresenceUpdate === 'function') {
            await sock.sendPresenceUpdate('available').catch(() => {});
        }

        return reply(enabled
            ? '✅ *Always Online enabled.* The connected session will keep advertising available presence. This does not enable auto-read.'
            : '❌ *Always Online disabled.* Presence will return to normal on the next connection cycle.');
    },
};

'use strict';

const database = require('../../utils/database');

module.exports = {
    name: 'cmdreact',
    aliases: ['commandreact', 'cmdreaction'],
    description: 'React before running commands',
    usage: '.cmdreact on|off|status',
    category: 'owner',
    ownerOnly: true,

    async execute({ sock, msg, args, reply, phoneNumber }) {
        const pn = phoneNumber
            || (sock.user?.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
        if (!pn) return reply('❌ Could not identify the bot session.');

        const option = String(args[0] || 'status').toLowerCase();
        if (option === 'status') {
            return reply(
                `⚡ *Command Reactions:* ${database.getCmdReact(pn) ? '✅ ON' : '❌ OFF'}\n` +
                'Use `.cmdreact on` or `.cmdreact off`.'
            );
        }

        if (['on', 'enable', '1', 'true'].includes(option)) {
            database.setCmdReact(pn, true);
            return reply('✅ Command reactions are now ON.');
        }

        if (['off', 'disable', '0', 'false'].includes(option)) {
            database.setCmdReact(pn, false);
            return reply('✅ Command reactions are now OFF.');
        }

        return reply('⚠️ Use `.cmdreact on`, `.cmdreact off`, or `.cmdreact status`.');
    },
};

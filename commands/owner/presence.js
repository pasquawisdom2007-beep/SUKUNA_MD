/**
 * Supported command-processing presence mode.
 * Usage: .presence meta [on | off | status]
 *
 * WhatsApp exposes standard composing/paused states through Baileys. The
 * proprietary Meta Business Agent phrases shown in the WhatsApp UI cannot be
 * set by third-party bots, so this command intentionally does not spoof them.
 */

const database = require('../../utils/database');

module.exports = {
    name: 'presence',
    aliases: ['metapresence', 'aipresence'],
    description: 'Show a supported AI-style processing presence while commands run',
    category: 'owner',

    async execute({ reply, args, phoneNumber }) {
        const mode = String(args[0] || '').toLowerCase();
        // The short form requested by the owner, `.presence meta`, enables
        // the mode. Explicit `status` remains available for inspection.
        const action = String(args[1] || (mode === 'meta' ? 'on' : 'status')).toLowerCase();
        const enabled = database.getMetaPresence(phoneNumber);

        if (mode !== 'meta' || action === 'status' || !action) {
            return reply(
                '🧠 *Meta-style command presence*\n\n' +
                `Status: ${enabled ? '✅ ON' : '❌ OFF'}\n\n` +
                '*Usage:*\n' +
                '• .presence meta — enable processing presence\n' +
                '• .presence meta on — show processing presence before commands\n' +
                '• .presence meta off — disable it\n' +
                '• .presence meta status — show current state\n\n' +
                '_Uses WhatsApp’s supported composing/paused states. Proprietary Meta Business Agent phrases are not exposed to Baileys._'
            );
        }

        if (['on', 'enable', '1'].includes(action)) {
            database.setMetaPresence(phoneNumber, true);
            return reply(
                '✅ *Meta-style presence enabled*\n\n' +
                'The bot will show a brief processing state while permitted commands run.\n' +
                '_No extra chat messages or presence loops are used._'
            );
        }

        if (['off', 'disable', '0'].includes(action)) {
            database.setMetaPresence(phoneNumber, false);
            return reply('❌ *Meta-style presence disabled*\n\nCommands will use the normal response flow.');
        }

        return reply('❓ Usage: `.presence meta on | off | status`');
    },
};

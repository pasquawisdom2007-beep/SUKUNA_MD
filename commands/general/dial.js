'use strict';

const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

/**
 * .dial <phone number> [label]
 *
 * Sends a tap-to-call button. When the recipient taps it, THEIR device
 * places a normal call (via WhatsApp) to the number you specify — same
 * as if they'd tapped a phone number link. This is the real, working
 * "call button" primitive; there is no separate "call link" primitive
 * to fake — this IS what a call button does under the hood.
 *
 * Number must include country code, digits only (no +, spaces, dashes).
 *
 * Usage:
 *   .dial 15551234567
 *   .dial 15551234567 Ring the office
 */

const NUMBER_RE = /^\d{7,15}$/;

module.exports = {
    name: 'dial',
    aliases: ['callbtn', 'ctacall'],
    description: 'Send a tap-to-call button for a phone number',
    usage: '.dial <number> [label]',
    category: 'general',

    async execute({ sock, msg, from, args, reply }) {
        const raw = args[0];
        if (!raw) {
            return reply(
                '❌ *Usage:* `.dial <number> [label]`\n\n' +
                'Number needs the country code, digits only.\n' +
                '`.dial 15551234567 Ring the office`'
            );
        }

        const number = raw.replace(/[^\d]/g, '');
        if (!NUMBER_RE.test(number)) {
            return reply('❌ That number doesn\'t look right. Country code + digits only, e.g. `15551234567`.');
        }

        const label = args.slice(1).join(' ') || 'Call';

        const buttons = [
            {
                name: 'cta_call',
                buttonParamsJson: JSON.stringify({
                    display_text: `📞 ${label}`,
                    phone_number: number,
                }),
            },
        ];

        const interactiveMessage = {
            body: { text: `📞 *Tap to Call*\n\n+${number}` },
            footer: { text: 'SUKUNA MD · Dial' },
            header: {
                title: '✦ CALL ✦',
                hasMediaAttachment: false,
            },
            nativeFlowMessage: {
                buttons,
                messageParamsJson: '',
            },
        };

        const wrapped = generateWAMessageFromContent(
            from,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                        interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactiveMessage),
                    },
                },
            },
            { userJid: sock.user?.id, quoted: msg }
        );

        await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
    },
};

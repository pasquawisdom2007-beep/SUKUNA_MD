'use strict';

const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

/**
 * .gcall <call link> [label]
 *
 * Sends a real WhatsApp call link as a tappable button instead of plain text.
 *
 * NOTE ON SCOPE:
 * Baileys cannot mint a WhatsApp call link out of thin air — those links are
 * created server-side when someone actually starts a call in the official app.
 * This command takes that link (start the call, WhatsApp gives you a share
 * link, paste it here) and turns it into a proper "cta_url" button so people
 * can tap to join instead of copy-pasting a URL.
 *
 * Usage:
 *   .gcall https://call.whatsapp.com/voice/XXXXXXXXXX
 *   .gcall https://call.whatsapp.com/video/XXXXXXXXXX Join the standup
 */

const CALL_LINK_RE = /^https:\/\/call\.whatsapp\.com\/(voice|video)\/[A-Za-z0-9_-]+/i;

module.exports = {
    name: 'gcall',
    aliases: ['callink', 'calllink'],
    description: 'Post a WhatsApp call link as a tappable join button',
    usage: '.gcall <call link> [label]',
    category: 'general',

    async execute({ sock, msg, from, args, reply }) {
        const link = args[0];
        if (!link) {
            return reply(
                '❌ *Usage:* `.gcall <call link> [label]`\n\n' +
                'Start a voice/video call in WhatsApp, tap *Share* on the call ' +
                'screen to copy the link, then run:\n' +
                '`.gcall https://call.whatsapp.com/voice/XXXXXXXXXX Join the call`'
            );
        }
        if (!CALL_LINK_RE.test(link)) {
            return reply('❌ That doesn\'t look like a WhatsApp call link. It should start with `https://call.whatsapp.com/voice/` or `/video/`.');
        }

        const isVideo = /\/video\//i.test(link);
        const label = args.slice(1).join(' ') || (isVideo ? 'Join Video Call' : 'Join Voice Call');

        const buttons = [
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: `${isVideo ? '📹' : '📞'} ${label}`,
                    url: link,
                    merchant_url: link,
                }),
            },
        ];

        const interactiveMessage = {
            body: { text: `${isVideo ? '📹 *Video Call*' : '📞 *Voice Call*'}\n\nTap below to join.` },
            footer: { text: 'SUKUNA MD · Call Bridge' },
            header: {
                title: isVideo ? '✦ VIDEO CALL ✦' : '✦ VOICE CALL ✦',
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

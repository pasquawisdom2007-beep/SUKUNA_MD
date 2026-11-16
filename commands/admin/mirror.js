'use strict';

const config = require('../../config');
const { generateWAMessageFromContent, proto } = require('@pasqua-dev/baileys');

function clockFor(timeZone) {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(new Date());
    } catch (_) {
        return new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(new Date());
    }
}

function mirrorPayload({ title, body }) {
    return proto.Message.InteractiveMessage.fromObject({
        body: { text: body },
        header: {
            title,
            hasMediaAttachment: false,
        },
        nativeFlowMessage: {
            // This native surface is resolved by each WhatsApp client, so the
            // profile image shown to each viewer is their own local profile
            // image instead of one static image sent by the bot.
            buttons: [{
                name: 'inapp_signup',
                buttonParamsJson: '{}',
            }],
            messageParamsJson: '{}',
        },
    });
}

function sendMirrorCard({ sock, jid, msg, title, body }) {
    const wrapped = generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadataVersion: 2,
                        deviceListMetadata: {},
                    },
                    interactiveMessage: mirrorPayload({ title, body }),
                },
            },
        },
        {
            userJid: sock.user?.id,
            quoted: msg,
        }
    );
    return sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
}

module.exports = {
    name: 'mirror',
    aliases: ['reflection', 'selfie'],
    description: 'Send a native mirror card that renders each viewer profile image',
    usage: '.mirror',
    category: 'general',

    async execute({ sock, msg, from, reply }) {
        const timeZone = process.env.BOT_TIMEZONE || 'Africa/Lagos';
        const title = `🪞 ${config.botName || 'SUKUNA MD'} MIRRORㅤㅤ${clockFor(timeZone)}`;
        const body = '```◈ LOOK AT YOURSELF```\n`『your profile · your mirror』`';
        try {
            await sendMirrorCard({ sock, jid: from, msg, title, body });
        } catch (error) {
            console.error('[Mirror Native Card]', error.message);
            await reply(`🪞 *Mirror*\n\nLook at yourself, ${config.botName || 'SUKUNA MD'} style.`);
        }
    },
};

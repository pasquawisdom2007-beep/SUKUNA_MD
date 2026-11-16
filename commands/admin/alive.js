'use strict';

const os = require('os');
const config = require('../../config');
const { generateWAMessageFromContent, proto } = require('@pasqua-dev/baileys');

function uptimeText(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${days}d –${hours}hr –${minutes}m –${secs}s..`;
}

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

function sendNativeAliveCard({ sock, jid, msg, title, body }) {
    const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
        body: { text: body },
        header: {
            title,
            hasMediaAttachment: false,
        },
        nativeFlowMessage: {
            // WhatsApp renders this native flow as the viewer-specific
            // contact/profile surface. Do not replace it with HTML or media.
            buttons: [{
                name: 'inapp_signup',
                buttonParamsJson: '{}',
            }],
            messageParamsJson: '{}',
        },
    });

    const wrapped = generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadataVersion: 2,
                        deviceListMetadata: {},
                    },
                    interactiveMessage,
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
    name: 'alive',
    aliases: ['status', 'online'],
    description: 'Show native viewer-specific uptime status',
    category: 'admin',
    async execute({ sock, msg, from, reply }) {
        const uptime = uptimeText(process.uptime());
        const timeZone = process.env.BOT_TIMEZONE || 'Africa/Lagos';
        const title = `♲ ${config.botName || 'SUKUNA MD'}ㅤㅤㅤ${clockFor(timeZone)}`;
        const body = `\`\`\`⚉ ${uptime}\`\`\`\n\`『${timeZone}』\``;

        try {
            await sendNativeAliveCard({ sock, jid: from, msg, title, body });
        } catch (error) {
            console.error('[Alive Native Card]', error.message);
            const totalMB = Math.round(os.totalmem() / 1024 / 1024);
            const freeMB = Math.round(os.freemem() / 1024 / 1024);
            await reply(`🟢 ${config.botName || 'SUKUNA MD'} is alive.\nUptime: ${uptime}\nMemory: ${(totalMB - freeMB).toLocaleString()}MB / ${totalMB.toLocaleString()}MB`);
        }
    },
};

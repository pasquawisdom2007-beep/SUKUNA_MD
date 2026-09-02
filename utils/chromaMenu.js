'use strict';

const fs = require('fs');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

const CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCJho147XeEEuR1LA3s';

const MENU_COLUMNS = [
    {
        title: 'MENU 1',
        commands: [
            ['📶 Ping', 'ping'],
            ['📋 Menu2', 'menu'],
            ['🃏 TSM Cards', 'card'],
            ['🔄 Refresh', 'menu'],
            ['♻️ Restart', 'restart'],
            ['🛡️ Safe', 'safe'],
        ],
    },
    {
        title: 'MENU 2',
        commands: [
            ['🧠 tsmll', 'tsmll'],
            ['➕ Adinv', 'add'],
            ['➕ Adinv2', 'add'],
            ['🔷 Hexa', 'hex'],
            ['🖼️ Rpic', 'rpic'],
            ['🖼️ Rpic2', 'rpic'],
        ],
    },
    {
        title: 'MENU 3',
        commands: [
            ['🧠 tsmll', 'tsmll'],
            ['📋 Menu2', 'menu'],
            ['📶 Ping', 'ping'],
            ['❔ Unknown', 'unknown'],
            ['❔ Unknown', 'unknown'],
            ['❔ Unknown', 'unknown'],
        ],
    },
];

function quickReply(displayText, id) {
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: displayText, id }),
    };
}

function ctaUrl(displayText, url) {
    return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: url }),
    };
}

function buildButtons(prefix = '.') {
    const buttons = [];
    for (const column of MENU_COLUMNS) {
        for (const [label, command] of column.commands) {
            buttons.push(quickReply(label, `${prefix}${command}`));
        }
    }
    buttons.push(ctaUrl('📢 Channel', CHANNEL_URL));
    return buttons;
}

async function sendChromaMenu({
    sock,
    jid,
    caption,
    prefix = '.',
    channelJid,
    channelName,
    imagePath,
    quoted,
}) {
    const contextInfo = channelJid ? {
        isForwarded: true,
        forwardingScore: 999,
        forwardedNewsletterMessageInfo: {
            newsletterJid: channelJid,
            newsletterName: channelName || '',
            serverMessageId: 143,
        },
    } : undefined;

    let header = {
        title: 'M E N U · gen4',
        subtitle: 'Tap a button to run a command',
        hasMediaAttachment: false,
    };

    if (imagePath && fs.existsSync(imagePath)) {
        try {
            const image = await require('@pasqua-baileys/baileys').generateWAMessageContent(
                { image: { url: imagePath } },
                { upload: sock.waUploadToServer }
            );
            if (image?.imageMessage) {
                header = { ...header, hasMediaAttachment: true, imageMessage: image.imageMessage };
            }
        } catch (error) {
            console.error('[Chroma] image header failed:', error.message);
        }
    }

    const interactive = {
        body: { text: caption },
        footer: { text: 'JSM ★ Modder · SUKUNA MD' },
        header,
        nativeFlowMessage: {
            buttons: buildButtons(prefix),
            messageParamsJson: JSON.stringify({ version: 3 }),
        },
    };

    const wrapped = generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactive),
                },
            },
            ...(contextInfo ? { messageContextInfo: contextInfo } : {}),
        },
        { userJid: sock.user?.id, quoted }
    );

    if (contextInfo) {
        try {
            const inner = wrapped.message?.viewOnceMessage?.message?.interactiveMessage;
            if (inner) inner.contextInfo = { ...(inner.contextInfo || {}), ...contextInfo };
        } catch (_) {}
    }

    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

module.exports = { sendChromaMenu, buildButtons, quickReply, MENU_COLUMNS };

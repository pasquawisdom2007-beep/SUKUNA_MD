/**
 * Chroma Menu Renderer — interactive (native flow) menu.
 *
 * Modern WhatsApp clients ignore legacy `buttons:` payloads, so we ship the
 * Chroma menu as an `interactiveMessage` with native-flow quick_reply buttons
 * (Ping / Alive / Uptime / Repo) plus a cta_url button that opens the
 * official WhatsApp channel. The dispatcher in lib/sessionManager.js already
 * decodes interactiveResponseMessage → nativeFlowResponseMessage and routes
 * the embedded command id back through the normal command pipeline, so tapping
 * Ping fires .ping, tapping Alive fires .alive, etc.
 */

'use strict';

const fs = require('fs');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

const CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCJho147XeEEuR1LA3s';

function quickReply(displayText, id) {
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: displayText, id }),
    };
}

function ctaUrl(displayText, url) {
    return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
            display_text: displayText,
            url,
            merchant_url: url,
        }),
    };
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
    const buttons = [
        quickReply('📶 Ping',    `${prefix}ping`),
        quickReply('💚 Alive',   `${prefix}alive`),
        quickReply('⏱️ Uptime',  `${prefix}uptime`),
        quickReply('📦 Repo',    `${prefix}repo`),
        ctaUrl   ('📢 Channel',  CHANNEL_URL),
    ];

    const contextInfo = channelJid ? {
        isForwarded: true,
        forwardingScore: 999,
        forwardedNewsletterMessageInfo: {
            newsletterJid:   channelJid,
            newsletterName:  channelName || '',
            serverMessageId: 143,
        },
    } : undefined;

    // Optional image header.
    let header = {
        title: '✦ SUKUNA MD · CHROMA ✦',
        subtitle: 'Tap a button below',
        hasMediaAttachment: false,
    };

    if (imagePath && fs.existsSync(imagePath)) {
        try {
            const img = await require('@pasqua-baileys/baileys').generateWAMessageContent(
                { image: { url: imagePath } },
                { upload: sock.waUploadToServer }
            );
            if (img?.imageMessage) {
                header = {
                    ...header,
                    hasMediaAttachment: true,
                    imageMessage: img.imageMessage,
                };
            }
        } catch (e) {
            console.error('[Chroma] image header failed, sending text-only:', e.message);
        }
    }

    const interactive = {
        body:   { text: caption },
        footer: { text: 'SUKUNA MD · Chroma' },
        header,
        nativeFlowMessage: {
            buttons,
            messageParamsJson: '',
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
        { userJid: sock.user?.id, quoted },
    );

    // Re-attach the channel pill on the inner interactiveMessage so the
    // "View Channel" affordance rides along with the menu.
    if (contextInfo) {
        try {
            const inner = wrapped.message?.viewOnceMessage?.message?.interactiveMessage;
            if (inner) {
                inner.contextInfo = { ...(inner.contextInfo || {}), ...contextInfo };
            }
        } catch (_) {}
    }

    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

module.exports = { sendChromaMenu };

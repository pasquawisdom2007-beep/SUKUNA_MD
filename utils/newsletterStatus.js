'use strict';

const {
    encodeNewsletterMessage,
    generateMessageIDV2,
    generateWAMessageContent,
} = require('@pasqua-dev/baileys');

const NEWSLETTER_STATUS_ATTRIBUTION = 9;

function mediaTypeForPayload(payload) {
    return ['image', 'video', 'audio', 'document', 'sticker']
        .find(type => Object.prototype.hasOwnProperty.call(payload || {}, type));
}

function statusMessageContext(message) {
    const key = Object.keys(message || {})[0];
    if (!key || !message[key] || typeof message[key] !== 'object') return message;
    return {
        ...message,
        [key]: {
            ...message[key],
            contextInfo: {
                ...(message[key].contextInfo || {}),
                statusAttributions: [{ type: NEWSLETTER_STATUS_ATTRIBUTION }],
                featureEligibilities: {
                    canBeReshared: true,
                    canReceiveMultiReact: true,
                    ...(message[key].contextInfo?.featureEligibilities || {}),
                },
            },
        },
    };
}

/**
 * Publish a channel status directly. This deliberately does not call
 * sock.sendMessage(channelJid, ...), because that creates a normal channel
 * feed post rather than the green-ring channel status shown in WhatsApp.
 */
async function postNewsletterStatus(sock, channelJid, payload) {
    if (typeof sock?.sendNode !== 'function') {
        throw new Error('This Pasqua Baileys session does not expose raw status transport');
    }
    if (!/^\d+@newsletter$/i.test(String(channelJid || ''))) {
        throw new Error('A valid newsletter JID is required for channel status');
    }

    let uploadResult = null;
    const upload = async (filePath, options) => {
        uploadResult = await sock.waUploadToServer(filePath, options);
        return uploadResult;
    };
    const message = await generateWAMessageContent(payload, {
        jid: channelJid,
        upload,
        mediaCache: sock.mediaCache,
        logger: sock.logger,
    });
    const attributed = statusMessageContext(message);
    const encoded = Buffer.from(encodeNewsletterMessage(attributed));
    const mediaType = mediaTypeForPayload(payload);
    const messageId = generateMessageIDV2(sock.user?.id || undefined);
    const attrs = {
        to: channelJid,
        id: messageId,
        type: mediaType ? 'media' : 'text',
    };
    const plaintextAttrs = mediaType ? { mediatype: mediaType } : {};
    if (mediaType) {
        const mediaId = uploadResult?.handle || uploadResult?.mediaId || uploadResult?.media_id || uploadResult?.fbid;
        if (!mediaId) throw new Error('Newsletter media upload returned no channel-status media handle');
        attrs.media_id = String(mediaId);
    }

    await sock.sendNode({
        tag: 'status',
        attrs,
        content: [{ tag: 'plaintext', attrs: plaintextAttrs, content: encoded }],
    });
    return { id: messageId, mediaType, channelJid };
}

module.exports = { postNewsletterStatus, mediaTypeForPayload, NEWSLETTER_STATUS_ATTRIBUTION };

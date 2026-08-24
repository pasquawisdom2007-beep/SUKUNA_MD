'use strict';

const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

function quickReply(text, id) {
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: text, id }),
    };
}

async function sendRoadmapButtons({ sock, jid, quoted, text, prefix = '.', actions = [] }) {
    const buttons = actions.slice(0, 4).map(action => quickReply(action.text, action.id.startsWith(prefix) ? action.id : `${prefix}${action.id}`));
    const message = {
        body: { text },
        footer: { text: 'SUKUNA MD · choose an action' },
        header: { title: 'SUKUNA MD', hasMediaAttachment: false },
        nativeFlowMessage: { buttons, messageParamsJson: '' },
    };
    const wrapped = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject(message),
            },
        },
    }, { userJid: sock.user?.id, quoted });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

module.exports = { sendRoadmapButtons, quickReply };

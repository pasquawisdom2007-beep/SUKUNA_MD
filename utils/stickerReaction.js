'use strict';

// This is the Lottie sticker used by Sukuna's message sticker reaction.
// WhatsApp media URLs can expire; replace the payload if the CDN asset is
// rotated by WhatsApp in the future.
const STICKER_REACTION = Object.freeze({
    url: 'https://mmg.whatsapp.net/v/t62.15575-24/818766779_1129097639778153_6590267083545743956_n.enc?ccb=11-4&oh=01_Q5Aa5gHNe2HdbLE-cWkJXND2kbQ-dPCK_OUE8yMZftwYLe7BsQ&oe=6ADAC196&_nc_sid=5e03e0&mms3=true',
    fileSha256: 'Uoa2mnXeustnlPHuKU4SBDRzKn/Tfi7Yn8zDAbYCnos=',
    fileEncSha256: 'L2lSGKLAk7SXkVhBHuNwy2gyET1OhAcR8O7hTmFx0Ss=',
    mediaKey: 'rsI+FYArjYdzSdlGH4R6G5OUviYNZmBrFvoAitAlI7U=',
    mimetype: 'application/was',
    directPath: '/v/t62.15575-24/818766779_1129097639778153_6590267083545743956_n.enc?ccb=11-4&oh=01_Q5Aa5gHNe2HdbLE-cWkJXND2kbQ-dPCK_OUE8yMZftwYLe7BsQ&oe=6ADAC196&_nc_sid=5e03e0',
    isLottie: true,
});

function buildStickerReactionMessage(parentMessageKey) {
    if (!parentMessageKey || typeof parentMessageKey !== 'object') {
        throw new TypeError('A parent WhatsApp message key is required.');
    }

    return {
        messageContextInfo: {
            messageAssociation: {
                associationType: 11,
                parentMessageKey,
            },
        },
        stickerMessage: { ...STICKER_REACTION },
    };
}

async function relayStickerReaction(sock, jid, parentMessageKey) {
    if (!sock || typeof sock.relayMessage !== 'function') {
        throw new TypeError('The socket does not support relayMessage.');
    }
    if (!jid) throw new TypeError('A destination JID is required.');
    return sock.relayMessage(jid, buildStickerReactionMessage(parentMessageKey), {});
}

function isStickerReactionMessage(message) {
    const sticker = message?.stickerMessage;
    return sticker?.mimetype === 'application/was' && sticker?.isLottie === true;
}

module.exports = {
    STICKER_REACTION,
    buildStickerReactionMessage,
    relayStickerReaction,
    isStickerReactionMessage,
};

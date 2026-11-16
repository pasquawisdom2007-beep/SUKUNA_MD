'use strict';

const fs = require('fs');
const path = require('path');

// Exact animated sticker payload supplied for Sukuna sticker reactions.
const STICKER_REACTION = Object.freeze({
    url: 'https://mmg.whatsapp.net/o1/v/t24/f2/m232/AQPEoFVa7kEaTxJ5N4kBacoDZ1k0IzHqkfsmUhLxV8C4xB11yCktX6UEHvkJnmgTsnEhoRW27_Pma0f92oVnKzwBB4YUsMbtz2HlS_Oxeg?ccb=9-4&oh=01_Q5Aa5wEK3E2DIH-ZBY_naItwmTshYSHL2bClVxX2UUGd6_gOyw&oe=6B0DB1D3&_nc_sid=e6ed6c&mms3=true',
    fileSha256: 'BsnVlbXyY2a722AugpS5TLIuxPNmaHRU2Hi9vL90USY=',
    fileEncSha256: 'PQcd/lNPjIt/cbpv3UuTrnd5OH7O1GnASu0C3c+PdQg=',
    mediaKey: 'j6kvKJ0k1eha91lF+ruW+5TPGP5inpuCePSrFs0nhuI=',
    mimetype: 'image/webp',
    height: 64,
    width: 64,
    directPath: '/o1/v/t24/f2/m232/AQPEoFVa7kEaTxJ5N4kBacoDZ1k0IzHqkfsmUhLxV8C4xB11yCktX6UEHvkJnmgTsnEhoRW27_Pma0f92oVnKzwBB4YUsMbtz2HlS_Oxeg?ccb=9-4&oh=01_Q5Aa5wEK3E2DIH-ZBY_naItwmTshYSHL2bClVxX2UUGd6_gOyw&oe=6B0DB1D3&_nc_sid=e6ed6c',
    fileLength: '373112',
    mediaKeyTimestamp: '1793438486',
    firstFrameLength: 372742,
    firstFrameSidecar: 'z4sdmAKy5mcQPA==',
    isAnimated: true,
    isLottie: false,
    isAvatar: false,
    isAiSticker: false,
    premium: 0,
});

const CUSTOM_STICKER_FILE = path.join(process.cwd(), 'database', 'sreact-sticker-message.json');
const MAX_STICKER_REACTION_ATTEMPTS = 10;
const STICKER_REACTION_DELAY_MS = 250;

function parseReactionCount(value) {
    if (value === undefined || value === '') return 1;
    if (!/^[1-9]\d*$/.test(String(value))) return null;
    const count = Number(value);
    return Number.isSafeInteger(count) && count <= MAX_STICKER_REACTION_ATTEMPTS ? count : null;
}

function getQuotedStickerMessage(quoted) {
    if (!quoted) return null;
    const message = quoted.message || quoted;
    return message.stickerMessage || message.lottieStickerMessage ||
        quoted.stickerMessage || quoted.lottieStickerMessage ||
        (quoted.mtype === 'stickerMessage' || quoted.mtype === 'lottieStickerMessage' ? quoted : null);
}

function loadStickerReactionMessage() {
    try {
        if (!fs.existsSync(CUSTOM_STICKER_FILE)) return STICKER_REACTION;
        const saved = JSON.parse(fs.readFileSync(CUSTOM_STICKER_FILE, 'utf8'));
        if (saved && typeof saved === 'object' && (saved.stickerMessage || saved.lottieStickerMessage)) {
            return saved.stickerMessage || saved.lottieStickerMessage;
        }
        return saved && typeof saved === 'object' ? saved : STICKER_REACTION;
    } catch (error) {
        console.error('[SREACT] Could not load saved sticker:', error.message);
        return STICKER_REACTION;
    }
}

function saveStickerReactionMessage(quoted) {
    const stickerMessage = getQuotedStickerMessage(quoted);
    if (!stickerMessage) return false;
    fs.mkdirSync(path.dirname(CUSTOM_STICKER_FILE), { recursive: true });
    fs.writeFileSync(CUSTOM_STICKER_FILE, JSON.stringify(stickerMessage, null, 2));
    return true;
}

function buildStickerReactionMessage(parentMessageKey) {
    if (!parentMessageKey || typeof parentMessageKey !== 'object' || !parentMessageKey.id) {
        throw new TypeError('A parent WhatsApp message key is required.');
    }
    return {
        messageContextInfo: {
            messageAssociation: {
                associationType: 11,
                parentMessageKey,
            },
        },
        stickerMessage: { ...loadStickerReactionMessage() },
    };
}

async function sendStickerReaction(sock, jid, parentMessageKey, count = 1) {
    const attempts = parseReactionCount(count);
    if (!attempts || !jid || !parentMessageKey?.id || typeof sock?.relayMessage !== 'function') return false;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        await sock.relayMessage(jid, buildStickerReactionMessage(parentMessageKey), {});
        if (attempt + 1 < attempts) {
            await new Promise(resolve => setTimeout(resolve, STICKER_REACTION_DELAY_MS));
        }
    }
    return true;
}

async function relayStickerReaction(sock, jid, parentMessageKey) {
    if (!sock || typeof sock.relayMessage !== 'function') {
        throw new TypeError('The socket does not support relayMessage.');
    }
    if (!jid) throw new TypeError('A destination JID is required.');
    return sock.relayMessage(jid, buildStickerReactionMessage(parentMessageKey), {});
}

function isStickerReactionMessage(message) {
    const sticker = message?.stickerMessage || message?.lottieStickerMessage;
    if (!sticker) return false;
    return (sticker.mimetype === 'application/was' && sticker.isLottie === true) ||
        sticker.fileSha256 === STICKER_REACTION.fileSha256 ||
        sticker.fileEncSha256 === STICKER_REACTION.fileEncSha256;
}

module.exports = {
    STICKER_REACTION,
    DEFAULT_STICKER_MESSAGE: STICKER_REACTION,
    CUSTOM_STICKER_FILE,
    MAX_STICKER_REACTION_ATTEMPTS,
    parseReactionCount,
    getQuotedStickerMessage,
    loadStickerReactionMessage,
    saveStickerReactionMessage,
    buildStickerReactionMessage,
    sendStickerReaction,
    relayStickerReaction,
    isStickerReactionMessage,
};

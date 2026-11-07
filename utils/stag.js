'use strict';

const { downloadMediaMessage } = require('@pasqua-dev/baileys');

function stickerHash(stickerMessage) {
    const value = stickerMessage?.fileSha256 || stickerMessage?.fileEncSha256;
    if (!value) return null;
    return Buffer.isBuffer(value) ? value.toString('base64') : Buffer.from(value).toString('base64');
}

function unwrapMessage(message) {
    let current = message || {};
    for (let i = 0; i < 6; i += 1) {
        const next = current?.ephemeralMessage?.message
            || current?.viewOnceMessage?.message
            || current?.viewOnceMessageV2?.message;
        if (!next) break;
        current = next;
    }
    return current;
}

function stickerFromMessage(message) {
    return unwrapMessage(message)?.stickerMessage || null;
}

function quotedSticker(msg) {
    const current = unwrapMessage(msg?.message);
    const context = current?.extendedTextMessage?.contextInfo
        || current?.imageMessage?.contextInfo
        || current?.videoMessage?.contextInfo
        || current?.documentMessage?.contextInfo;
    const quoted = context?.quotedMessage;
    const message = unwrapMessage(quoted);
    return message?.stickerMessage ? {
        message,
        context,
        stickerMessage: message.stickerMessage,
    } : null;
}

function participantJid(participant) {
    return participant?.id || participant?.jid || participant?.phoneNumber || participant?.lid || null;
}

function sameIdentity(left, right) {
    const a = String(left || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const b = String(right || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    return Boolean(a && b && a === b);
}

function allMentionJids(meta, sock) {
    const botIds = [sock?.user?.id, sock?.user?.lid, sock?.user?.jid].filter(Boolean);
    return [...new Set((meta?.participants || [])
        .map(participantJid)
        .filter(jid => jid && !botIds.some(bot => sameIdentity(bot, jid))))];
}

async function repostWithSilentTags({ sock, from, msg, stickerMessage, meta }) {
    const buffer = await downloadMediaMessage(
        { message: { stickerMessage }, key: msg.key },
        'buffer',
        {},
        sock.updateMediaMessage
    );
    const mentionedJid = allMentionJids(meta, sock);
    if (!mentionedJid.length) return false;
    // Match hidetag's working sendMessage contract. Baileys serializes the
    // top-level mentions array into stickerMessage.contextInfo.mentionedJid.
    await sock.sendMessage(from, {
        sticker: buffer,
        mentions: mentionedJid,
    }, { quoted: msg });
    return true;
}

module.exports = { stickerHash, stickerFromMessage, quotedSticker, allMentionJids, repostWithSilentTags };

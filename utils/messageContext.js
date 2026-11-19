'use strict';

const messageVault = require('./messageVault');

function unwrapMessage(message) {
    let current = message;
    for (let i = 0; i < 8 && current; i += 1) {
        const next = current.ephemeralMessage?.message || current.viewOnceMessage?.message || current.viewOnceMessageV2?.message || current.viewOnceMessageV2Extension?.message || current.documentWithCaptionMessage?.message;
        if (!next) break;
        current = next;
    }
    return current || null;
}

function contextInfo(message) {
    const current = unwrapMessage(message) || {};
    for (const value of Object.values(current)) if (value?.contextInfo) return value.contextInfo;
    return null;
}

function messageText(message) {
    const current = unwrapMessage(message) || {};
    return current.conversation || current.extendedTextMessage?.text || current.imageMessage?.caption || current.videoMessage?.caption || current.documentMessage?.caption || current.buttonsResponseMessage?.selectedButtonId || current.listResponseMessage?.title || '';
}

function mediaType(message) {
    const current = unwrapMessage(message) || {};
    return Object.entries({ imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', documentMessage: 'document', stickerMessage: 'sticker' }).find(([key]) => current[key]);
}

function mediaContent(entry) {
    if (entry.type === 'image') return { image: entry.mediaBuffer, ...(entry.caption ? { caption: entry.caption } : {}) };
    if (entry.type === 'video') return { video: entry.mediaBuffer, mimetype: entry.mimetype || 'video/mp4', ...(entry.caption ? { caption: entry.caption } : {}) };
    if (entry.type === 'audio') return { audio: entry.mediaBuffer, mimetype: entry.mimetype || 'audio/mp4', ptt: !!entry.ptt };
    if (entry.type === 'sticker') return { sticker: entry.mediaBuffer };
    return { document: entry.mediaBuffer, fileName: entry.fileName || 'quoted-file', mimetype: entry.mimetype || 'application/octet-stream' };
}

function buildVaultQuoted(entry, from, sock, forwardTo = from) {
    if (!entry) return null;
    return {
        key: { remoteJid: from, id: entry.id, participant: entry.sender, fromMe: false },
        message: entry,
        sender: entry.sender,
        participant: entry.sender,
        chat: from,
        text: entry.body || entry.caption || '',
        type: entry.type || 'unknown',
        isMedia: Boolean(entry.mediaBuffer),
        fromStore: true,
        download: entry.mediaBuffer ? async () => entry.mediaBuffer : undefined,
        forward: async () => entry.mediaBuffer
            ? sock.sendMessage(forwardTo, mediaContent(entry), {})
            : sock.sendMessage(forwardTo, { text: entry.body || entry.caption || 'Recovered quoted message.' }, {}),
    };
}

function buildLocalVaultQuoted(entry, raw, from, sock, forwardTo = from, cache) {
    if (!entry) return null;
    const rawMessage = raw?.message || {};
    const base = buildQuoted(rawMessage, raw?.key || { id: entry.id, participant: entry.sender }, from, sock, cache, new Set(), forwardTo);
    if (!base) return null;
    base.fromStore = true;
    base.type = entry.type || base.type;
    base.isMedia = Boolean(entry.mediaBuffer) || base.isMedia;
    if (entry.mediaBuffer) {
        base.download = async () => entry.mediaBuffer;
        base.forward = async () => sock.sendMessage(forwardTo, mediaContent(entry), {});
    }
    return base;
}

function buildQuoted(message, key, from, sock, cache, seen = new Set(), forwardTo = from) {
    if (!message) return null;
    const unwrapped = unwrapMessage(message) || {};
    const mediaEntry = mediaType(message);
    const quoted = {
        key: { remoteJid: from, id: key?.id || '', participant: key?.participant || from, fromMe: !!key?.fromMe },
        message,
        sender: key?.participant || from,
        participant: key?.participant || from,
        chat: from,
        text: messageText(message),
        type: Object.keys(unwrapped)[0] || 'unknown',
        isMedia: Boolean(mediaEntry),
        download: mediaEntry ? async () => {
            const { downloadContentFromMessage } = require('@pasqua-dev/baileys');
            const stream = await downloadContentFromMessage(unwrapped[mediaEntry[0]], mediaEntry[1]);
            const chunks = [];
            for await (const chunk of stream) chunks.push(Buffer.from(chunk));
            return Buffer.concat(chunks);
        } : undefined,
    };

    const nestedInfo = contextInfo(message);
    const nestedId = nestedInfo?.stanzaId;
    const localNested = nestedId ? messageVault.lookup(sock?.__sukunaPhoneNumber, from, nestedId) : null;
    const localRawNested = nestedId ? messageVault.getRaw(sock?.__sukunaPhoneNumber, from, nestedId) : null;
    const storedNested = nestedId ? cache?.get(from)?.get(nestedId) : null;
    const deletedNested = nestedId ? require('./retrieveStore').getById(sock?.__sukunaPhoneNumber, nestedId, from) : null;
    if (localNested && !seen.has(nestedId)) {
        seen.add(nestedId);
        quoted.quoted = buildLocalVaultQuoted(localNested, localRawNested, from, sock, forwardTo, cache);
    } else if (deletedNested && !seen.has(nestedId)) {
        seen.add(nestedId);
        quoted.quoted = buildVaultQuoted(deletedNested, from, sock, forwardTo);
    } else if (storedNested && !seen.has(nestedId)) {
        seen.add(nestedId);
        quoted.quoted = buildQuoted(storedNested.message, storedNested.key, from, sock, cache, seen, forwardTo);
    } else if (nestedInfo?.quotedMessage && nestedId && !seen.has(nestedId)) {
        seen.add(nestedId);
        quoted.quoted = buildQuoted(nestedInfo.quotedMessage, { id: nestedId, participant: nestedInfo.participant || quoted.sender }, from, sock, cache, seen, forwardTo);
    }

    quoted.forward = async () => {
        if (quoted.isMedia) return sock.sendMessage(forwardTo, mediaEntry[1] === 'image' ? { image: await quoted.download() } : mediaEntry[1] === 'video' ? { video: await quoted.download() } : mediaEntry[1] === 'audio' ? { audio: await quoted.download(), mimetype: unwrapped.audioMessage?.mimetype || 'audio/mp4' } : { document: await quoted.download(), fileName: unwrapped.documentMessage?.fileName || 'quoted-file' }, {});
        return sock.sendMessage(forwardTo, { text: quoted.text || 'Quoted message recovered.' }, {});
    };
    return quoted;
}

function quotedContext(msg, from, sock, forwardTo = from) {
    const info = contextInfo(msg?.message);
    if (!info?.quotedMessage) return null;
    const cache = sock?.__sukunaMessageCache;
    const id = info.stanzaId;
    const deleted = id ? require('./retrieveStore').getById(sock?.__sukunaPhoneNumber, id, from) : null;
    if (deleted) return buildVaultQuoted(deleted, from, sock, forwardTo);
    const local = id ? messageVault.lookup(sock?.__sukunaPhoneNumber, from, id) : null;
    const localRaw = id ? messageVault.getRaw(sock?.__sukunaPhoneNumber, from, id) : null;
    if (local) return buildLocalVaultQuoted(local, localRaw, from, sock, forwardTo, cache);
    let stored = id ? cache?.get(from)?.get(id) : null;
    if (!stored && cache?.get(from)) {
        const inlineText = messageText(info.quotedMessage).trim();
        if (inlineText) {
            const candidates = [...cache.get(from).values()].reverse();
            stored = candidates.find(item => messageText(item.message).trim() === inlineText && contextInfo(item.message)?.quotedMessage);
        }
    }
    const key = stored?.key || { id: id || '', participant: info.participant || msg?.key?.participant || from };
    return buildQuoted(stored?.message || info.quotedMessage, key, from, sock, cache, new Set(), forwardTo);
}

function createMessageContext({ msg, sock, from, sender, reply, args = [], prefix, commandName, forwardTo = from }) {
    return { key: msg?.key, message: msg?.message, chat: from, from, sender, participant: sender, isGroup: String(from || '').endsWith('@g.us'), fromMe: Boolean(msg?.key?.fromMe), text: messageText(msg?.message), args, prefix, command: commandName, sock, msg, reply, quoted: quotedContext(msg, from, sock, forwardTo) };
}

module.exports = { createMessageContext, quotedContext, messageText, unwrapMessage, mediaType };

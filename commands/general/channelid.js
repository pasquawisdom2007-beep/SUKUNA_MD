'use strict';

const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

const CHANNEL_LINK_RE = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i;
const NEWSLETTER_JID_RE = /^\d{8,}@newsletter$/i;

function normalizeNewsletterJid(value) {
    const text = String(value || '').trim();
    return NEWSLETTER_JID_RE.test(text) ? text : null;
}

function findNewsletterJid(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);

    for (const key of ['newsletterJid', 'newsletterId', 'channelJid', 'channelId', 'jid', 'id']) {
        const candidate = normalizeNewsletterJid(value[key]);
        if (candidate) return candidate;
    }
    for (const child of Object.values(value)) {
        const found = findNewsletterJid(child, seen);
        if (found) return found;
    }
    return null;
}

function getQuotedMessage(msg) {
    return msg?.quoted || msg?.quotedMessage || msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}

function getSearchText(msg, args) {
    const quoted = getQuotedMessage(msg);
    const pieces = [
        args?.join?.(' '),
        quoted?.text,
        quoted?.caption,
        quoted?.message?.conversation,
        quoted?.message?.extendedTextMessage?.text,
        quoted?.message?.imageMessage?.caption,
        quoted?.message?.videoMessage?.caption,
    ];
    return pieces.filter(Boolean).join(' ').trim();
}

function getChannelInvite(text) {
    return String(text || '').match(CHANNEL_LINK_RE)?.[1] || null;
}

async function sendCopyButton({ sock, msg, from, id, body }) {
    const button = {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
            display_text: 'Copy Newsletter ID',
            id: `channelid_copy_${Date.now()}`,
            copy_code: id,
        }),
    };
    try {
        const wrapped = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: body },
                        footer: { text: 'SUKUNA MD · CHANNEL ID' },
                        header: { title: '✦ NEWSLETTER ID ✦', hasMediaAttachment: false },
                        nativeFlowMessage: { buttons: [button], messageParamsJson: '' },
                    }),
                },
            },
        }, { userJid: sock.user?.id, ...(msg?.message ? { quoted: msg } : {}) });
        await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
    } catch (error) {
        console.error('[channelid:copy-button]', error?.message || error);
        await sock.sendMessage(from, { text: `${body}\n\n📋 Copy this ID:\n${id}` }, { quoted: msg });
    }
}

async function resolveChannel(sock, msg, args) {
    const quoted = getQuotedMessage(msg);
    const quotedKeyJid = normalizeNewsletterJid(quoted?.key?.remoteJid || quoted?.remoteJid || quoted?.chat);
    const currentChatJid = normalizeNewsletterJid(msg?.key?.remoteJid || msg?.remoteJid);
    const rawMessage = msg?.message || {};
    const contextCandidates = [
        msg,
        rawMessage,
        rawMessage.extendedTextMessage?.contextInfo,
        rawMessage.imageMessage?.contextInfo,
        rawMessage.videoMessage?.contextInfo,
        rawMessage.documentMessage?.contextInfo,
        rawMessage.stickerMessage?.contextInfo,
        quoted?.message?.extendedTextMessage?.contextInfo,
        quoted?.message?.imageMessage?.contextInfo,
        quoted?.message?.videoMessage?.contextInfo,
    ];
    const contextJid = contextCandidates
        .map(context => normalizeNewsletterJid(context?.remoteJid || context?.newsletterJid))
        .find(Boolean) || contextCandidates.map(findNewsletterJid).find(Boolean);
    const directJid = quotedKeyJid || currentChatJid || contextJid;
    const text = getSearchText(msg, args);
    const inviteCode = getChannelInvite(text);

    if (directJid) {
        let metadata = null;
        if (typeof sock.newsletterMetadata === 'function') {
            try { metadata = await sock.newsletterMetadata('jid', directJid); } catch (_) {}
        }
        return { id: normalizeNewsletterJid(metadata?.id) || directJid, metadata, source: 'quoted message' };
    }

    if (!inviteCode) return null;
    if (typeof sock.newsletterMetadata !== 'function') {
        throw new Error('This Baileys build does not support channel metadata lookup.');
    }

    let metadata;
    try {
        metadata = await sock.newsletterMetadata('invite', inviteCode);
    } catch (error) {
        const detail = String(error?.message || error || '').toLowerCase();
        if (detail.includes('404') || detail.includes('not-found')) throw new Error('That channel link is invalid or unavailable.');
        if (detail.includes('401') || detail.includes('403')) throw new Error('WhatsApp did not authorize this channel lookup.');
        throw new Error('Could not resolve that channel link right now.');
    }
    const id = normalizeNewsletterJid(metadata?.id);
    if (!id) throw new Error('WhatsApp returned channel metadata without a valid newsletter ID.');
    return { id, metadata, source: 'channel link' };
}

module.exports = {
    name: 'channelid',
    aliases: ['newsletterid', 'chid'],
    description: 'Resolve a WhatsApp Channel link or quoted newsletter message to its channel ID',
    usage: '.channelid <channel link> or reply to a channel message',
    category: 'general',

    async execute({ sock, msg, from, args, reply, prefix = '.' }) {
        try {
            const result = await resolveChannel(sock, msg, args);
            if (!result) {
                return reply(
                    `📡 *CHANNEL ID*\n\n` +
                    `Use:\n${prefix}channelid https://whatsapp.com/channel/XXXXXXXX\n` +
                    `or reply to a forwarded channel/newsletter message with ${prefix}channelid`
                );
            }

            const name = String(result.metadata?.name || result.metadata?.subject || '').trim();
            const link = result.metadata?.invite
                ? `https://whatsapp.com/channel/${result.metadata.invite}`
                : null;
            const body =
                `📡 *WHATSAPP CHANNEL ID*\n` +
                `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
                `🆔 *ID:* \`${result.id}\`\n` +
                (name ? `📛 *Name:* ${name}\n` : '') +
                `🔎 *Source:* ${result.source}\n` +
                (link ? `🔗 *Link:* ${link}\n` : '') +
                `\n_Copy the ID exactly, including @newsletter._`;
            await sendCopyButton({ sock, msg, from, id: result.id, body });
            return;
        } catch (error) {
            console.error('[channelid]', error?.message || error);
            return reply(`❌ *Channel lookup failed:* ${error?.message || 'Unknown error'}`);
        }
    },

    // Exported for focused tests and future channel utilities.
    _private: { normalizeNewsletterJid, findNewsletterJid, getChannelInvite, resolveChannel, sendCopyButton },
};

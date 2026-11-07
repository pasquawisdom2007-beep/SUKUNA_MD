'use strict';

function normalizeJid(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.endsWith('@g.us') || raw.endsWith('@broadcast') || raw.endsWith('@newsletter')) return raw;
    if (raw.endsWith('@s.whatsapp.net') || raw.endsWith('@lid')) return raw.replace(/:\d+(?=@)/, '');
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 ? `${digits}@s.whatsapp.net` : null;
}

function getContextInfo(msg = {}) {
    let message = msg.message || {};
    // Commands can arrive inside ephemeral/view-once/document wrappers. Walk
    // those wrappers so a reply target is not lost before getjid sees it.
    for (let depth = 0; depth < 6 && message; depth += 1) {
        const context = message.contextInfo
            || message.extendedTextMessage?.contextInfo
            || message.imageMessage?.contextInfo
            || message.videoMessage?.contextInfo
            || message.documentMessage?.contextInfo
            || message.audioMessage?.contextInfo
            || message.stickerMessage?.contextInfo
            || message.buttonsResponseMessage?.contextInfo
            || message.listResponseMessage?.contextInfo
            || message.templateButtonReplyMessage?.contextInfo
            || message.interactiveResponseMessage?.contextInfo;
        if (context) return context;
        message = message.ephemeralMessage?.message
            || message.viewOnceMessage?.message
            || message.viewOnceMessageV2?.message
            || message.documentWithCaptionMessage?.message
            || null;
    }
    return {};
}

function resolveMentionOrReply(msg, sender, from) {
    const context = getContextInfo(msg);
    const mentioned = Array.isArray(context.mentionedJid) ? context.mentionedJid : [];
    const mentionedAlt = Array.isArray(context.mentionedJidAlt) ? context.mentionedJidAlt : [];
    // In a group, context.remoteJid is the group itself—not the person whose
    // message was quoted. Never use it as the requested user's JID. Prefer an
    // explicit mention, then the quoted participant, and only fall back to the
    // current sender when the command is not targeting someone else.
    const targetCandidates = [
        ...mentionedAlt, ...mentioned,
        context.participantAlt, context.participant
    ].filter(Boolean).map(normalizeJid).filter(Boolean);
    const target = targetCandidates.find(jid => jid.endsWith('@s.whatsapp.net'))
        || targetCandidates[0];
    if (target) return target;
    // Do not silently report the command sender when WhatsApp marked this as
    // a reply but omitted the quoted participant.
    if (context.quotedMessage || context.stanzaId) return null;
    return normalizeJid(sender) || normalizeJid(from);
}

async function resolvePhoneJid(jid, sock, from, metadata = null) {
    const normalized = normalizeJid(jid);
    if (!normalized) return { jid: null, number: null, source: 'invalid' };
    if (normalized.endsWith('@s.whatsapp.net')) {
        return { jid: normalized, number: normalized.split('@')[0].split(':')[0], source: 'phone-jid' };
    }
    if (!normalized.endsWith('@lid')) return { jid: normalized, number: null, source: 'non-user-jid' };
    const mapping = sock?.signalRepository?.lidMapping;
    let mapped = null;
    try {
        mapped = await mapping?.getPNForLID?.(normalized);
    } catch (_) {}
    const resolved = normalizeJid(mapped);
    if (resolved?.endsWith('@s.whatsapp.net')) {
        return { jid: resolved, number: resolved.split('@')[0].split(':')[0], source: 'lid-mapping' };
    }
    // Some Baileys updates expose only an @lid in the reply context. Group
    // metadata often contains the matching phone JID, so resolve it there.
    try {
        if (String(from || '').endsWith('@g.us')) {
            const groupInfo = metadata || await sock?.groupMetadata?.(from);
            const match = groupInfo?.participants?.find((participant) => {
                const ids = [participant?.id, participant?.jid, participant?.lid, participant?.phoneNumber]
                    .filter(Boolean).map(normalizeJid);
                return ids.includes(normalized);
            });
            const phoneJid = normalizeJid(match?.phoneNumber) || normalizeJid(match?.id);
            if (phoneJid?.endsWith('@s.whatsapp.net')) {
                return { jid: phoneJid, number: phoneJid.split('@')[0].split(':')[0], source: 'group-metadata' };
            }
        }
    } catch (_) {}
    return { jid: normalized, number: null, source: 'lid-unresolved' };
}

function resolveArgument(args = []) {
    const raw = String(args[0] || '').trim();
    return raw ? normalizeJid(raw) : null;
}

async function extractNumber(jid, sock) {
    return (await resolvePhoneJid(jid, sock)).number;
}

function canReveal({ isGroup, isOwner, isAdmin }) {
    return !isGroup || Boolean(isOwner || isAdmin);
}

async function sendCopyCard({ sock, msg, from, body, title, copies = [], reply }) {
    const validCopies = copies.filter(item => item?.value);
    try {
        const { generateWAMessageFromContent, proto } = require('@pasqua-dev/baileys');
        const buttons = validCopies.map((item, index) => ({
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: item.label || `📋 Copy ${index + 1}`,
                id: `jid_copy_${Date.now()}_${index}`,
                copy_code: String(item.value)
            })
        }));
        const wrapped = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: body },
                        footer: { text: 'SUKUNA MD · JID TOOLS' },
                        header: { title: title || '✦ JID TOOLS ✦', hasMediaAttachment: false },
                        nativeFlowMessage: { buttons, messageParamsJson: '' }
                    })
                }
            }
        }, { userJid: sock.user?.id, ...(msg?.message ? { quoted: msg } : {}) });
        await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
    } catch (error) {
        console.error('[jid:copy-card]', error?.message || error);
        const fallback = `${body}\n\n${validCopies.map(item => `📋 ${item.label}: ${item.value}`).join('\n')}`;
        if (typeof reply === 'function') return reply(fallback);
        return sock.sendMessage(from, { text: fallback }, { quoted: msg });
    }
}

module.exports = { normalizeJid, getContextInfo, resolveMentionOrReply, resolveArgument, resolvePhoneJid, extractNumber, canReveal, sendCopyCard };

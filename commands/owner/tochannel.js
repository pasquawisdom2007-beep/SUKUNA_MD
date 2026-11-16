'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const CHANNEL_JID_RE = /^[0-9]+@newsletter$/i;
const CHANNEL_LINK_RE = /https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i;
const MEDIA_TYPES = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']);

function resolveTarget(args = []) {
    const tokens = args.map(String);
    const targetIndex = tokens.findIndex(token =>
        CHANNEL_JID_RE.test(token.replace(/[),]+$/, '')) || CHANNEL_LINK_RE.test(token)
    );
    if (targetIndex < 0) return null;
    const rawTarget = tokens[targetIndex].replace(/[),]+$/, '');
    const link = rawTarget.match(CHANNEL_LINK_RE);
    const jid = CHANNEL_JID_RE.test(rawTarget) ? rawTarget : null;
    const text = [...tokens.slice(0, targetIndex), ...tokens.slice(targetIndex + 1)].join(' ').trim();
    return { jid, link: link ? rawTarget : null, inviteCode: link?.[1] || null, text };
}

function hasExplicitNonAdminRole(metadata) {
    const viewer = metadata?.viewer_metadata || metadata?.viewerMetadata || {};
    if (viewer.is_admin === false) return true;
    const role = [viewer.role, viewer.admin_role, viewer.viewer_role, metadata?.viewer_role, metadata?.role]
        .find(value => typeof value === 'string' && value.trim());
    if (!role) return false;
    const normalized = role.toUpperCase();
    if (normalized.includes('ADMIN') || normalized.includes('OWNER')) return false;
    return /FOLLOWER|SUBSCRIBER|MEMBER|USER|VIEWER/.test(normalized);
}

function getQuotedMessageContent(quoted, extraText = '') {
    if (!quoted) return extraText.trim() ? { text: extraText.trim() } : null;
    const type = quoted.mtype || quoted.type || '';
    const message = quoted.msg || quoted.message || {};
    const mediaType = MEDIA_TYPES.has(type)
        ? type
        : MEDIA_TYPES.has(Object.keys(message)[0]) ? Object.keys(message)[0] : null;
    const caption = [extraText, quoted.caption, message[type]?.caption, message[mediaType]?.caption]
        .filter(value => typeof value === 'string' && value.trim()).join('\n').trim();

    if (mediaType) {
        return {
            mediaType,
            caption,
            mimetype: quoted.mimetype || message[mediaType]?.mimetype,
            fileName: quoted.fileName || message[mediaType]?.fileName,
            ptt: quoted.ptt ?? message[mediaType]?.ptt,
            gifPlayback: quoted.gifPlayback ?? message[mediaType]?.gifPlayback,
        };
    }

    const text = extraText || quoted.text || quoted.body || message.conversation ||
        message.extendedTextMessage?.text || message.imageMessage?.caption ||
        message.videoMessage?.caption || message.documentMessage?.caption || '';
    return text.trim() ? { text: text.trim() } : null;
}

function isAdminPublishError(error) {
    const message = `${error?.message || ''} ${error?.data?.message || ''}`.toLowerCase();
    return error?.statusCode === 401 || error?.statusCode === 403 ||
        error?.output?.statusCode === 401 || error?.output?.statusCode === 403 ||
        error?.data?.statusCode === 401 || error?.data?.statusCode === 403 ||
        /not.?admin|admin.?only|not authorized|not allowed|forbidden|not permitted|permission denied|not enough permission|401|403/.test(message) ||
        (/newsletter|channel/.test(message) && /admin|permission|privilege/.test(message));
}

async function toVoiceNote(buffer) {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sukuna-channel-'));
    const inputPath = path.join(tempDir, 'input-audio');
    const outputPath = path.join(tempDir, 'voice-note.ogg');
    try {
        await fs.promises.writeFile(inputPath, buffer);
        await execFileAsync('ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
            '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', '-ar', '48000',
            '-application', 'voip', outputPath,
        ], { timeout: 120000 });
        return await fs.promises.readFile(outputPath);
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

function getStatusRecipients(sock) {
    const contacts = sock?.store?.contacts || {};
    return Object.keys(contacts).filter(jid => /^(?:[0-9]+|[0-9]+:[0-9]+)@s\.whatsapp\.net$/i.test(jid));
}

async function postToStatus(sock, payload) {
    const statusJidList = getStatusRecipients(sock);
    if (!statusJidList.length) return false;
    await sock.sendMessage('status@broadcast', payload, {
        statusJidList,
        broadcast: true,
    });
    return true;
}

module.exports = {
    name: 'tochannel',
    aliases: ['channelpost', 'sendchannel'],
    description: 'Post text or replied media to a WhatsApp channel (owner only).',
    usage: '.tochannel <channel JID or invite link> <text> (or reply to text/media)',
    category: 'owner',
    ownerOnly: true,
    async execute({ sock, msg, m, from, args = [], reply, isOwner }) {
        if (!isOwner) return reply('🔒 *This command is reserved for the bot owner only.*');
        const target = resolveTarget(args);
        if (!target) {
            return reply('⚉ Usage: .tochannel <channel JID or invite link> <text>\nOr reply to text, image, video, audio, sticker, or document with .tochannel <channel JID or invite link>.');
        }

        try {
            let metadata;
            let jid = target.jid;
            if (target.inviteCode) {
                const info = typeof sock.newsletterGetInviteInfo === 'function'
                    ? await sock.newsletterGetInviteInfo(target.link)
                    : await sock.newsletterMetadata('invite', target.inviteCode);
                jid = info?.id;
                metadata = info;
            } else {
                metadata = await sock.newsletterMetadata('jid', jid);
            }
            if (!jid || !CHANNEL_JID_RE.test(jid)) {
                return reply('✘ Could not resolve that channel. Check the channel link or JID and try again.');
            }
            if (hasExplicitNonAdminRole(metadata)) return reply('✘ The bot is not an admin in that channel.');

            const quoted = m?.quoted || null;
            const content = getQuotedMessageContent(quoted, target.text);
            if (!content) return reply('⚉ Include text after the channel JID/link, or reply to text or media to post it.');

            let payload = content;
            if (content.mediaType) {
                if (typeof quoted?.download !== 'function') {
                    return reply('✘ I could not access the replied media. Reply directly to the original media and try again.');
                }
                const buffer = await quoted.download();
                if (!buffer?.length) return reply('✘ Failed to download the replied media.');
                const mediaKey = content.mediaType.replace('Message', '').toLowerCase();
                const audioBuffer = mediaKey === 'audio' ? await toVoiceNote(buffer) : buffer;
                payload = {
                    [mediaKey]: audioBuffer,
                    ...(mediaKey === 'audio' ? { mimetype: 'audio/ogg; codecs=opus', ptt: true } : content.mimetype ? { mimetype: content.mimetype } : {}),
                    ...(content.fileName && mediaKey !== 'audio' ? { fileName: content.fileName } : {}),
                    ...(content.caption && mediaKey !== 'audio' && mediaKey !== 'sticker' ? { caption: content.caption } : {}),
                    ...(mediaKey === 'video' && content.gifPlayback ? { gifPlayback: true } : {}),
                };
            }

            // A channel update is delivered in two stages: the status story
            // envelope, then the newsletter post itself. The fork requires a
            // non-empty statusJidList for status@broadcast; if no contacts are
            // cached, preserve the channel post instead of failing the command.
            await postToStatus(sock, payload).catch(error => {
                console.error('[TOCHANNEL STATUS]', error.message);
            });
            await sock.sendMessage(jid, payload);
            await sock.sendMessage(from, { react: { text: '✅', key: msg?.key } }).catch(() => {});
            return reply('ᯤ *Posted successfully to Status & Channel.*');
        } catch (error) {
            console.error('[TOCHANNEL ERROR]', error);
            if (isAdminPublishError(error)) return reply('✘ The bot is not an admin in that channel.');
            return reply(`✘ Could not post to the channel: ${error?.message || 'unknown error'}`);
        }
    },
    helpers: { resolveTarget, hasExplicitNonAdminRole, getQuotedMessageContent, isAdminPublishError, toVoiceNote, getStatusRecipients, postToStatus },
};

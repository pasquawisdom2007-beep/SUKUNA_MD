/**
 * gcstatus — Post text, link, image, video or audio to WhatsApp *Group* Status
 *
 * ✅ No admin required — bot works as a regular group member
 * ✅ Uses the official groupStatusMessageV2 API (Baileys)
 *
 * Usage:
 *   .gcstatus Hello world!            → text group status
 *   .gcstatus https://example.com     → link as text group status
 *   Reply to a message + .gcstatus    → posts that message to group status
 *   Reply to a photo  + .gcstatus     → image group status
 *   Reply to a video  + .gcstatus     → video group status
 *   Reply to an audio + .gcstatus     → audio/voice group status
 *
 *   All media types accept an optional caption:
 *   Reply to photo + .gcstatus My caption
 */

'use strict';

const crypto = require('crypto');
const { normaliseBuffer } = require('../../lib/groupPhoto');

let _baileys;
let _baileysSource = 'unknown';
const BAILEYS_CANDIDATES = ['@pasqua-dev/baileys'];
for (const pkg of BAILEYS_CANDIDATES) {
    try {
        _baileys = require(pkg);
        _baileysSource = pkg;
        break;
    } catch (_) {}
}
if (!_baileys) throw new Error('No baileys package found. Install @pasqua-dev/baileys');
const {
    generateWAMessageContent,
    generateWAMessageFromContent,
    downloadContentFromMessage,
    prepareWAMessageMedia,
    generateMessageIDV2,
} = _baileys;
const { PassThrough } = require('stream');

const TEXT_BG_COLOR = '#9C27B0';
const TEXT_FG_COLOR = '#FFFFFF';
const TIMEOUT_MS    = 30_000;

function hexToArgb(hex, alpha = 0xFF) {
    const clean = String(hex || '').replace('#', '').trim();
    const value = clean.length === 3
        ? clean.split('').map(ch => ch + ch).join('')
        : clean.padStart(6, '0').slice(-6);
    return (((alpha & 0xFF) << 24) | parseInt(value, 16)) >>> 0;
}

const STATUS_BG_ARGB = hexToArgb(TEXT_BG_COLOR);
const STATUS_FG_ARGB = hexToArgb(TEXT_FG_COLOR);

// ── OFFICIAL CHANNEL (View Channel pill on every status post) ─────────────
const CHANNEL_JID  = '120363426805095237@newsletter';
const CHANNEL_NAME = 'Sukuna MD Pasqua tech';
const STATUS_RING_EMOJI = '🩸';
const STATUS_RING_NAME = 'Pasqua';
const STATUS_RING_PALETTE = {
    red:    '#E53935',
    pink:   '#E91E8C',
    blue:   '#2196F3',
    yellow: '#F4C20D',
    purple: '#9C27B0',
};
const STATUS_RING_CYCLE = ['red', 'pink', 'blue', 'yellow', 'purple'];
let statusRingIndex = 0;
const STATUS_COLOR_ALIASES = {
    magenta: 'pink',
    violet: 'purple',
    orange: 'yellow',
    gold: 'yellow',
};

function getStatusRingColor() {
    const colour = STATUS_RING_CYCLE[statusRingIndex % STATUS_RING_CYCLE.length];
    statusRingIndex += 1;
    return colour;
}

function buildChannelCtx() {
    return {
        isForwarded: true,
        forwardingScore: 999,
        forwardedNewsletterMessageInfo: {
            newsletterJid:   CHANNEL_JID,
            newsletterName:  CHANNEL_NAME,
            serverMessageId: 143,
        },
    };
}
// WhatsApp uses this audience metadata when rendering a group-status entry in
// the status list. Keeping it in contextInfo works for both the native
// groupStatus:true path and the generated groupStatusMessageV2 fallback.
// The command remains fully compatible when older clients ignore these fields.
function normaliseStatusColor(value) {
    const key = String(value || '').trim().toLowerCase();
    return STATUS_RING_PALETTE[key] ? key : STATUS_COLOR_ALIASES[key] || null;
}

function parseStatusColor(value) {
    const raw = String(value || '').trim();
    const words = raw.split(/\s+/).filter(Boolean);
    const last = normaliseStatusColor(words[words.length - 1]);
    if (!last) return { text: raw, color: null };
    words.pop();
    return { text: words.join(' ').trim(), color: last };
}

function buildStatusAudienceCtx(ringColorOverride) {
    const ringColor = normaliseStatusColor(ringColorOverride) || getStatusRingColor();
    return {
        isGroupStatus: true,
        statusSourceType: 4,
        pairedMediaType: 0,
        statusAttributions: [{ type: 6 }],
        statusAudienceMetadata: {
            audienceType: 2,
            listName: STATUS_RING_NAME,
            listEmoji: STATUS_RING_EMOJI,
            // Kept alongside listEmoji for forks/clients that expose the
            // audience ring colour separately.
            ringColor,
            ringColorHex: STATUS_RING_PALETTE[ringColor],
        },
    };
}
function attachChannelCtxToInner(inner, ringColorOverride) {
    const keys = ['extendedTextMessage','imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
    for (const k of keys) {
        if (inner && inner[k]) {
            inner[k] = {
                ...inner[k],
                contextInfo: {
                    ...(inner[k].contextInfo || {}),
                    ...buildStatusAudienceCtx(ringColorOverride),
                    ...buildChannelCtx(),
                },
            };
        }
    }
    return inner;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function downloadMedia(mediaMsg, type) {
    return new Promise(async (resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('Media download timed out')),
            TIMEOUT_MS
        );
        try {
            const stream = await downloadContentFromMessage(mediaMsg, type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            clearTimeout(timer);
            resolve(Buffer.concat(chunks));
        } catch (err) {
            clearTimeout(timer);
            reject(err);
        }
    });
}

/**
 * fetchLinkPreview — fetch OG/meta tags from a URL and return
 * { title, description, imageBuffer } for use as a sharp, full-res
 * preview image instead of WhatsApp's auto-fetched blurry thumbnail.
 *
 * Falls back gracefully: if anything fails the caller just omits the
 * previewImage and lets WhatsApp do its own (blurry) fetch.
 */
async function fetchLinkPreview(url) {
    const result = { title: null, description: null, imageBuffer: null, thumbnailBuffer: null, imageUrl: null };
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'WhatsApp/2.23.20.0 A',
                'Accept':     'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
        });
        clearTimeout(timer);
        if (!res.ok) return result;

        const html = await res.text();

        // Extract og:title / title
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
                        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
        if (ogTitle) result.title = ogTitle.trim().slice(0, 120);

        // Extract og:description / description
        const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ||
                       html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
        if (ogDesc) result.description = ogDesc.trim().slice(0, 300);

        // Extract og:image and download it at full resolution
        const imgUrl = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];

        if (imgUrl) {
            const absImg = imgUrl.startsWith('http') ? imgUrl : new URL(imgUrl, url).href;
            // Keep the original remote URL. WhatsApp's thumbnail-link upload can
            // preserve better source metadata than a re-encoded low-res buffer.
            result.imageUrl = absImg;
            try {
                const imgCtrl = new AbortController();
                const imgTimer = setTimeout(() => imgCtrl.abort(), 12_000);
                const imgRes = await fetch(absImg, {
                    signal: imgCtrl.signal,
                    headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' },
                });
                clearTimeout(imgTimer);
                if (imgRes.ok) {
                    const buf = Buffer.from(await imgRes.arrayBuffer());
                    // Only use if it's a real image (check first bytes)
                    if (buf.length > 1000) {
                    try {
                        const { thumbnail } = await normaliseBuffer(buf);
                        // Keep the original OG bytes for the actual status image.
                        // Resizing the source to 1080px before upload was the main
                        // cause of soft/blurred previews on high-resolution links.
                        result.imageBuffer = buf;
                        result.thumbnailBuffer = thumbnail || result.imageBuffer;
                    } catch {
                        result.imageBuffer = buf;
                        result.thumbnailBuffer = buf;
                    }
                }
                }
            } catch (_) {}
        }
    } catch (_) {}
    return result;
}

async function getGroupParticipantJids(sock, groupJid) {
    try {
        const meta = await sock.groupMetadata(groupJid);
        return (meta?.participants || []).map(p => p.id).filter(Boolean);
    } catch (e) {
        console.error('[gcstatus] groupMetadata failed:', e.message);
        return [];
    }
}

function resolveGroupDisplayName(metadata, groupJid) {
    const candidates = [metadata?.subject, metadata?.name, metadata?.groupName];
    const jid = String(groupJid || '').trim();
    for (const candidate of candidates) {
        const name = String(candidate || '').replace(/\s+/g, ' ').trim();
        if (!name || name === jid || /^(?:\d{5,}|[\da-z-]+)@g\.us$/i.test(name)) continue;
        return name.slice(0, 120);
    }
    return 'WhatsApp Group';
}

// ─── group-status delivery core ──────────────────────────────────────────────
// Every group-status stanza needs the recipient list. Without it WhatsApp
// accepts the relay and delivers the update to nobody, and the fork's
// richPreview branch refuses outright:
//
//   if (!recipients?.length) throw new Boom(
//       'groupStatus richPreview requires statusJidList', { statusCode: 400 })
//   — lib/Socket/messages-send.js, richPreview branch
//
// That is why text/link posts never arrived while image/video/audio did:
// media never sets `richPreview`, so it took the normal path, while every text
// post hit the guard above, was caught, and fell through to a relay that was
// built without recipients.
async function resolveStatusRecipients(sock, groupJid) {
    const fromGroup = await getGroupParticipantJids(sock, groupJid);
    if (fromGroup.length) return fromGroup;

    const cached = sock?.store?.groupMetadata?.[groupJid]?.participants
        || sock?.groupMetadata?.[groupJid]?.participants;
    if (Array.isArray(cached) && cached.length) {
        const ids = cached.map(p => p?.id).filter(Boolean);
        if (ids.length) return ids;
    }
    return [];
}

/**
 * Emit a raw groupStatusMessageV2 stanza — the exact envelope the fork's own
 * interactive-handler emits (handleGroupStory), so text is delivered with the
 * same structure media uses.
 */
async function relayGroupStatusInner(sock, groupJid, inner, opts = {}) {
    const recipients = Array.isArray(opts.recipients) && opts.recipients.length
        ? opts.recipients
        : await resolveStatusRecipients(sock, groupJid);

    if (!recipients.length) {
        throw new Error('No group members resolved for the status audience');
    }

    const ringColor = normaliseStatusColor(opts.ringColor) || getStatusRingColor();
    const message = opts.attachContext === false
        ? { ...inner }
        : attachChannelCtxToInner({ ...inner }, ringColor);

    const secret = opts.secret || crypto.randomBytes(32);
    const msg = generateWAMessageFromContent(
        groupJid,
        {
            messageContextInfo: { messageSecret: secret },
            groupStatusMessageV2: {
                message: { ...message, messageContextInfo: { messageSecret: secret } },
            },
        },
        {}
    );

    await sock.relayMessage(groupJid, msg.message, {
        messageId: msg.key.id,
        statusJidList: recipients,
        additionalAttributes: { messageId: msg.key.id },
    });

    return { msg, recipients };
}

/** First argument that names a group JID, e.g. 120363...@g.us */
function resolveTargetJid(args = []) {
    for (const value of args) {
        const match = String(value || '').match(/(\d{5,})@g\.us/i);
        if (match) return `${match[1]}@g.us`;
    }
    return '';
}

// ── membership ───────────────────────────────────────────────────────────────
// WHY THE OLD CHECK BLOCKED EVERY VALID JID
// -----------------------------------------
// It compared `sock.user.id`'s digits against each participant's digits. On a
// modern paired session those two live in DIFFERENT namespaces:
//   sock.user.id  → 233535590939:12@s.whatsapp.net   (phone number, :device)
//   participants  → 99887766@lid                     (LID mode)
// `233535590939` never equals `99887766`, so the guard answered
// "not a member" for groups the bot was sitting in.
//
// The check now collects every identity WhatsApp gives us for the bot (PN jid,
// LID, device-suffixed and bare), normalises both sides, and — crucially —
// treats `groupFetchAllParticipating()` as the authority, because that call
// returns ONLY groups the account is actually in.

function botIdentityCandidates(sock) {
    const jidNorm = require('@pasqua-dev/baileys').jidNormalizedUser || ((v) => v);
    const raw = [
        sock?.user?.id,
        sock?.user?.jid,
        sock?.user?.lid,
        sock?.authState?.creds?.me?.id,
        sock?.authState?.creds?.me?.lid,
        sock?.authState?.creds?.me?.phoneNumber,
    ].filter(Boolean);

    const full = new Set();
    const bare = new Set();
    for (const value of raw) {
        const text = String(value).trim();
        if (!text) continue;
        const additions = [text];
        try { additions.push(jidNorm(text)); } catch (_) { /* keep raw */ }
        if (text.includes(':')) additions.push(`${text.split(':')[0]}@${text.split('@')[1] || 's.whatsapp.net'}`);
        for (const candidate of additions) {
            if (!candidate) continue;
            full.add(candidate);
            const user = candidate.split('@')[0].split(':')[0].replace(/\D/g, '');
            if (user) bare.add(user);
        }
    }
    return { full, bare };
}

function participantMatches(participants = [], self) {
    for (const participant of participants) {
        const ids = [participant?.id, participant?.jid, participant?.lid, participant?.phoneNumber].filter(Boolean);
        for (const value of ids) {
            const text = String(value).trim();
            if (!text) continue;
            if (self.full.has(text)) return text;
            const user = text.split('@')[0].split(':')[0].replace(/\D/g, '');
            if (user && self.bare.has(user)) return text;
        }
    }
    return '';
}

/**
 * Is the bot a member of `groupJid`?
 *
 * Returns { ok:true } when membership is proven, or when it cannot be
 * determined at all (optimistic — a false "not a member" is worse than letting
 * WhatsApp reject an impossible post). It returns { ok:false } only on positive
 * evidence of absence.
 */
async function assertBotInGroup(sock, groupJid) {
    const jid = String(groupJid || '').trim();
    if (!/^\d{5,}@g\.us$/i.test(jid)) {
        return { ok: false, reason: `\`${jid || '(empty)'}\` is not a valid group JID.`, jid };
    }

    const self = botIdentityCandidates(sock);
    let meta = null;
    let metaError = '';

    try {
        meta = await sock.groupMetadata(jid);
    } catch (error) {
        metaError = String(error?.message || error);
    }

    const participants = Array.isArray(meta?.participants) ? meta.participants : [];
    if (participants.length) {
        const matched = participantMatches(participants, self);
        if (matched) {
            return { ok: true, jid, subject: meta?.subject || '', members: participants.length, via: 'participants' };
        }
    }

    // Authoritative list: every group this account is in.
    let known = null;
    if (typeof sock?.groupFetchAllParticipating === 'function') {
        try {
            const map = await sock.groupFetchAllParticipating();
            if (map && typeof map === 'object') known = Object.keys(map);
        } catch (error) {
            console.error('[gcstatus] groupFetchAllParticipating failed:', error.message);
        }
    }

    if (Array.isArray(known) && known.length) {
        if (known.includes(jid)) {
            return { ok: true, jid, subject: meta?.subject || '', members: participants.length, via: 'participating' };
        }
        return {
            ok: false,
            reason: `The bot is not a member of ${jid}. Get a valid JID with \`.groups\`.`,
            jid,
        };
    }

    // Membership could not be verified (throttled metadata, no group list).
    // Proceed — the post itself will fail loudly if the bot truly is not there.
    console.warn(`[gcstatus] membership unverified for ${jid}${metaError ? ` (${metaError.slice(0, 80)})` : ''} — attempting anyway`);
    return { ok: true, jid, subject: meta?.subject || '', members: participants.length, via: 'unverified' };
}

async function postGroupStatus(sock, groupJid, content) {
    const effectiveRingColor = normaliseStatusColor(content?.ringColor) || getStatusRingColor();
    const recipients = await resolveStatusRecipients(sock, groupJid);

    const {
        backgroundColor, ringColor,
        previewTitle, previewDescription, previewImage,
        ...rest
    } = content || {};

    const hasMedia   = !!(rest.image || rest.video || rest.audio || rest.document || rest.sticker);
    const rawText    = typeof rest.text === 'string' ? rest.text : '';
    const isTextPost = !hasMedia && rawText.trim().length > 0;
    const isLinkPost = isTextPost && /https?:\/\//i.test(rawText);

    // ── TEXT / LINK ────────────────────────────────────────────────────────
    // Handled explicitly and separately from media: no `richPreview` flag on
    // plain text (it triggers the statusJidList guard and the link-card path),
    // and the URL case always carries the recipient list.
    if (isTextPost) {
        // Text/link must travel through the SAME envelope media uses:
        // sock.sendMessage(..., { groupStatus: true }) → generateWAMessageContent
        // wraps it into groupStatusMessageV2 and enriches contextInfo
        // (isGroupStatus + statusSourceType: TEXT). No `richPreview` flag here —
        // that branch demands statusJidList and only builds a link card.
        try {
            return await sock.sendMessage(groupJid, {
                text: rest.text,
                groupStatus: true,
                statusJidList: recipients,
                backgroundColor: backgroundColor || TEXT_BG_COLOR,
                contextInfo: buildStatusAudienceCtx(effectiveRingColor),
            }, recipients.length ? { statusJidList: recipients } : undefined);
        } catch (error) {
            console.error('[gcstatus] groupStatus text send failed, relaying:', error.message);
        }

        // Fallback: emit the raw groupStatusMessageV2 stanza directly (the exact
        // shape the fork's own handleGroupStory emits).
        const textMessage = {
            extendedTextMessage: {
                text: rest.text,
                backgroundArgb: hexToArgb(backgroundColor || TEXT_BG_COLOR),
                textArgb: STATUS_FG_ARGB,
                font: 0,
                ...(isLinkPost
                    ? { matchedText: rawText.match(/https?:\/\/\S+/i)?.[0] || rawText }
                    : {}),
            },
        };
        const { msg } = await relayGroupStatusInner(sock, groupJid, textMessage, {
            recipients,
            ringColor: effectiveRingColor,
        });
        return msg;
    }

    // ── MEDIA (unchanged working path, recipients now attached) ────────────
    const payload = {
        ...rest,
        groupStatus: true,
        statusJidList: recipients,
        contextInfo: { ...buildStatusAudienceCtx(effectiveRingColor), ...buildChannelCtx() },
    };

    try {
        return await sock.sendMessage(groupJid, payload,
            recipients.length ? { statusJidList: recipients } : undefined);
    } catch (error) {
        console.error('[gcstatus] groupStatus media send failed, relaying:', error.message);
    }

    const inner = await generateWAMessageContent(rest, {
        upload: sock.waUploadToServer,
        backgroundColor: backgroundColor || TEXT_BG_COLOR,
    });
    const { msg } = await relayGroupStatusInner(sock, groupJid, inner, {
        recipients,
        ringColor: effectiveRingColor,
        attachContext: false,
    });
    return msg;
}

async function encodeOpus(buffer) {
    let ffmpeg;
    try { ffmpeg = require('fluent-ffmpeg'); } catch { return buffer; }
    return new Promise((resolve) => {
        const input  = new PassThrough();
        const output = new PassThrough();
        const chunks = [];
        input.end(buffer);
        ffmpeg(input)
            .noVideo()
            .audioCodec('libopus')
            .format('ogg')
            .audioChannels(1)
            .audioFrequency(48000)
            .on('error', () => resolve(buffer))
            .on('end',   () => resolve(Buffer.concat(chunks)))
            .pipe(output);
        output.on('data', (c) => chunks.push(c));
    });
}

function getQuotedCtx(msg) {
    const m = msg.message;
    return (
        m?.extendedTextMessage?.contextInfo ||
        m?.imageMessage?.contextInfo        ||
        m?.videoMessage?.contextInfo        ||
        m?.audioMessage?.contextInfo        ||
        m?.stickerMessage?.contextInfo      ||
        null
    );
}

function extractRelaySourceMessage(quotedMsg) {
    if (!quotedMsg || typeof quotedMsg !== 'object') return null;
    if (quotedMsg.ephemeralMessage?.message) return extractRelaySourceMessage(quotedMsg.ephemeralMessage.message);
    if (quotedMsg.viewOnceMessage?.message)  return extractRelaySourceMessage(quotedMsg.viewOnceMessage.message);
    if (quotedMsg.extendedTextMessage) return { extendedTextMessage: quotedMsg.extendedTextMessage };
    if (quotedMsg.groupInviteMessage)  return { groupInviteMessage: quotedMsg.groupInviteMessage };
    if (quotedMsg.conversation)        return { conversation: quotedMsg.conversation };
    return null;
}

function extractRelaySourceContextInfo(msg) {
    const ctx = msg?.message?.extendedTextMessage?.contextInfo || null;
    if (!ctx) return null;
    const qm = ctx.quotedMessage || {};
    return (
        qm?.extendedTextMessage?.contextInfo ||
        qm?.imageMessage?.contextInfo ||
        qm?.videoMessage?.contextInfo ||
        null
    );
}

async function postRelayGroupStatus(sock, groupJid, innerMessage, extraContextInfo, quotedMsg, ringColorOverride) {
    const effectiveRingColor = normaliseStatusColor(ringColorOverride) || getStatusRingColor();
    try {
        const ext = innerMessage?.extendedTextMessage;
        if (ext) {
            const merged = {
                ...ext,
                contextInfo: {
                    ...(ext.contextInfo || {}),
                    ...(extraContextInfo?.externalAdReply
                        ? { externalAdReply: extraContextInfo.externalAdReply }
                        : {}),
                    ...buildStatusAudienceCtx(effectiveRingColor),
                    ...buildChannelCtx(),
                },
            };
            return await sock.sendMessage(groupJid, {
                extendedTextMessage: merged,
                raw:         true,
                groupStatus: true,
                richPreview: true,
            }, quotedMsg ? { quoted: quotedMsg } : undefined);
        }
    } catch (e) {
        console.error('[gcstatus] raw extendedTextMessage relay failed, using legacy path:', e.message);
    }

    const secret = crypto.randomBytes(32);
    const inner  = { ...innerMessage };
    if (extraContextInfo?.externalAdReply && inner.extendedTextMessage) {
        inner.extendedTextMessage = {
            ...inner.extendedTextMessage,
            contextInfo: {
                ...(inner.extendedTextMessage.contextInfo || {}),
                externalAdReply: extraContextInfo.externalAdReply,
            },
        };
    }
    attachChannelCtxToInner(inner, effectiveRingColor);

    const msg = generateWAMessageFromContent(
        groupJid,
        {
            messageContextInfo: { messageSecret: secret },
            groupStatusMessageV2: {
                message: { ...inner, messageContextInfo: { messageSecret: secret } },
            },
        },
        {}
    );

    const statusJidList = await getGroupParticipantJids(sock, groupJid);
    await sock.relayMessage(groupJid, msg.message, {
        messageId: msg.key.id,
        statusJidList,
        additionalAttributes: { messageId: msg.key.id },
    });
    return msg;
}


function unwrapQuotedDeep(qm) {
    if (!qm || typeof qm !== 'object') return qm;
    if (qm.ephemeralMessage?.message)              return unwrapQuotedDeep(qm.ephemeralMessage.message);
    if (qm.viewOnceMessage?.message)               return unwrapQuotedDeep(qm.viewOnceMessage.message);
    if (qm.viewOnceMessageV2?.message)             return unwrapQuotedDeep(qm.viewOnceMessageV2.message);
    if (qm.viewOnceMessageV2Extension?.message)    return unwrapQuotedDeep(qm.viewOnceMessageV2Extension.message);
    if (qm.documentWithCaptionMessage?.message)    return unwrapQuotedDeep(qm.documentWithCaptionMessage.message);
    return qm;
}

// Build non-blue link preview with image thumbnail
async function createImageLinkPreview(sock, url, title, description, imageBuffer, imageUrl, thumbnailBuffer) {
    try {
        let thumbnail = null;
        // Prefer the downloaded high-resolution image buffer so WhatsApp does
        // not derive the preview from a small remote thumbnail. Keep the
        // original URL as a fallback when the local upload cannot be prepared.
        const sources = [];
        if (imageBuffer) sources.push({ image: imageBuffer });
        if (imageUrl) sources.push({ image: { url: imageUrl } });
        for (const source of sources) {
            try {
                const prepared = await prepareWAMessageMedia(
                    source,
                    { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
                );
                const hq = prepared.imageMessage;
                thumbnail = {
                    thumbnailDirectPath: hq?.directPath,
                    mediaKey: hq?.mediaKey,
                    mediaKeyTimestamp: hq?.mediaKeyTimestamp,
                    thumbnailWidth: hq?.width,
                    thumbnailHeight: hq?.height,
                    thumbnailSha256: hq?.fileSha256,
                    thumbnailEncSha256: hq?.fileEncSha256,
                    jpegThumbnail: hq?.jpegThumbnail ? Buffer.from(hq.jpegThumbnail) : undefined,
                };
                if (thumbnail.thumbnailDirectPath || thumbnail.jpegThumbnail) break;
            } catch (err) {
                console.error('[thumbnail prepare]', err.message);
            }
        }

        return {
            extendedTextMessage: {
                text: url,
                matchedText: url,
                canonicalUrl: url,
                title: title || 'Link',
                description: description || url,
                previewType: 5, // IMAGE - not blue
                // Native status color fields prevent WhatsApp from treating the
                // link as a default blue/blurred text preview.
                backgroundArgb: STATUS_BG_ARGB,
                textArgb: STATUS_FG_ARGB,
                font: 0,
                ...(thumbnailBuffer ? { jpegThumbnail: thumbnailBuffer } : thumbnail || { jpegThumbnail: undefined }),
            }
        };
    } catch (err) {
        console.error('[image preview]', err.message);
        return null;
    }
}

// Post a URL to group status with a crisp, non-blurry image preview —
// the exact same prepareWAMessageMedia(mediaTypeOverride:'thumbnail-link')
// technique commands/group/invite.js uses for group invite links, applied
// to the groupStatusMessageV2 envelope. Falls back to the plainer
// richPreview/previewImage path (WhatsApp's own, softer thumbnail) only if
// thumbnail generation fails outright.
//
// Shared by gcstatus.js's own command AND globalstatus.js, so both render
// identically instead of globalstatus using a lower-quality fallback path.
async function postNativeGroupInviteStatus(sock, groupJid) {
    const meta = await sock.groupMetadata(groupJid);
    const inviteCode = await sock.groupInviteCode(groupJid);
    const inviteLink = `https://chat.whatsapp.com/${inviteCode}?mode=gi_t`;
    // Do not let an ID-like metadata value leak into the rich preview title.
    const groupName = resolveGroupDisplayName(meta, groupJid);

    let hq = null;
    let clearThumbnail = null;
    try {
        const photoUrl = await sock.profilePictureUrl(groupJid, 'image');
        if (photoUrl) {
            // Build the inline thumbnail from a normalized image instead of
            // WhatsApp's tiny remote thumbnail. This keeps the native story
            // preview sharp on clients that do not re-fetch the image.
            try {
                const photoResponse = await fetch(photoUrl, {
                    headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' },
                });
                if (photoResponse.ok) {
                    const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());
                    const normalized = await normaliseBuffer(photoBuffer);
                    clearThumbnail = normalized.thumbnail || null;
                    if (normalized.full) {
                        const preparedFull = await prepareWAMessageMedia(
                            { image: normalized.full },
                            { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
                        );
                        hq = preparedFull?.imageMessage || null;
                    }
                }
            } catch (error) {
                console.error('[gcstatus invite image]', error.message);
            }

            // Keep the invite-style remote preparation as a fallback if the
            // high-resolution fetch/normalization was unavailable.
            if (hq) return await relayNativeGroupInviteStatus(sock, groupJid, meta, inviteLink, groupName, hq, clearThumbnail);
            const prepared = await prepareWAMessageMedia(
                { image: { url: photoUrl } },
                { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
            );
            hq = prepared?.imageMessage || null;
        }
    } catch (error) {
        console.error('[gcstatus invite preview]', error.message);
    }

    return relayNativeGroupInviteStatus(sock, groupJid, meta, inviteLink, groupName, hq, clearThumbnail);
}

async function relayNativeGroupInviteStatus(sock, groupJid, meta, inviteLink, groupName, hq, clearThumbnail) {
    const inviteMessage = {
        extendedTextMessage: {
            text: inviteLink,
            matchedText: inviteLink,
            canonicalUrl: inviteLink,
            title: groupName,
            description: `${meta?.participants?.length || 0} members · WhatsApp Group Invite`,
            previewType: 5,
            jpegThumbnail: clearThumbnail || (hq?.jpegThumbnail ? Buffer.from(hq.jpegThumbnail) : undefined),
            ...(hq ? {
                thumbnailDirectPath: hq.directPath,
                mediaKey: hq.mediaKey,
                mediaKeyTimestamp: hq.mediaKeyTimestamp,
                thumbnailWidth: hq.width,
                thumbnailHeight: hq.height,
                thumbnailSha256: hq.fileSha256,
                thumbnailEncSha256: hq.fileEncSha256,
            } : {}),
        },
    };

    attachChannelCtxToInner(inviteMessage);
    const secret = crypto.randomBytes(32);
    const msg = generateWAMessageFromContent(
        groupJid,
        {
            messageContextInfo: { messageSecret: secret },
            groupStatusMessageV2: {
                message: {
                    ...inviteMessage,
                    messageContextInfo: { messageSecret: secret },
                },
            },
        },
        {}
    );

    const statusJidList = await getGroupParticipantJids(sock, groupJid);
    await sock.relayMessage(groupJid, msg.message, {
        messageId: msg.key.id,
        statusJidList,
        additionalAttributes: { messageId: msg.key.id },
    });
    return msg;
}

async function postGroupStatusLinkPreview(sock, groupJid, url, ringColorOverride) {
    const effectiveRingColor = normaliseStatusColor(ringColorOverride) || getStatusRingColor();
    const recipients = await resolveStatusRecipients(sock, groupJid);
    const preview = await fetchLinkPreview(url);

    // Preferred path: let @pasqua-dev/baileys build the complete rich preview.
    // The recipient list is mandatory here — the fork throws
    // 'groupStatus richPreview requires statusJidList' without it, which is
    // what silently killed every link status before this fix.
    try {
        return await sock.sendMessage(groupJid, {
            text: url,
            richPreview: true,
            groupStatus: true,
            statusJidList: recipients,
            contextInfo: buildStatusAudienceCtx(effectiveRingColor),
            ...(preview.title       ? { previewTitle: preview.title }             : {}),
            ...(preview.description ? { previewDescription: preview.description } : {}),
            ...(preview.imageBuffer ? { previewImage: preview.imageBuffer }       : {}),
        }, recipients.length ? { statusJidList: recipients } : undefined);
    } catch (error) {
        console.error('[gcstatus] native rich link preview failed, falling back:', error.message);
    }

    // A native link preview is always rendered from a thumbnail by WhatsApp.
    // When an OG image is available, send that image as the actual group-status
    // media instead — the only reliable way to keep the photo sharp on
    // recipients' devices. The URL and page metadata stay in the caption.
    if (preview.imageBuffer) {
        const lines = [preview.title || 'Link', preview.description || '', url]
            .map(value => String(value || '').trim())
            .filter(Boolean);
        return postGroupStatus(sock, groupJid, {
            image: preview.imageBuffer,
            caption: lines.join('\n\n'),
            ringColor: effectiveRingColor,
        });
    }

    // No OG image: relay the URL as a text status card rather than risking the
    // richPreview guard again.
    const { msg } = await relayGroupStatusInner(sock, groupJid, {
        extendedTextMessage: {
            text: url,
            matchedText: url,
            canonicalUrl: url,
            title: preview.title || 'Link',
            description: preview.description || url,
            backgroundArgb: STATUS_BG_ARGB,
            textArgb: STATUS_FG_ARGB,
            font: 0,
        },
    }, { recipients, ringColor: effectiveRingColor });
    return msg;
}

// ─── shared exports (used by gcstatusdm.js) ──────────────────────────────────
module.exports.downloadMedia        = downloadMedia;
module.exports.fetchLinkPreview     = fetchLinkPreview;
module.exports.postGroupStatus          = postGroupStatus;
module.exports.postRelayGroupStatus     = postRelayGroupStatus;
module.exports.postGroupStatusLinkPreview = postGroupStatusLinkPreview;
module.exports.postNativeGroupInviteStatus = postNativeGroupInviteStatus;
module.exports.resolveGroupDisplayName = resolveGroupDisplayName;
module.exports.resolveStatusRecipients    = resolveStatusRecipients;
module.exports.relayGroupStatusInner      = relayGroupStatusInner;
module.exports.resolveTargetJid           = resolveTargetJid;
module.exports.assertBotInGroup           = assertBotInGroup;
module.exports.encodeOpus               = encodeOpus;
module.exports.getQuotedCtx             = getQuotedCtx;
module.exports.unwrapQuotedDeep         = unwrapQuotedDeep;
module.exports.createImageLinkPreview   = createImageLinkPreview;
module.exports.TEXT_BG_COLOR            = TEXT_BG_COLOR;
module.exports.baileysSource            = _baileysSource;

// ─── command ─────────────────────────────────────────────────────────────────

module.exports = Object.assign(module.exports, {
    name:        'gcstatus',
    aliases:     ['groupstatus', 'gstatus', 'poststatus'],
    description: 'Post text, link, image, video or audio to the group status feed',
    usage:       '.gcstatus <text|link>  OR  reply to any message + .gcstatus [caption]',
    category:    'general',

    async execute(cmdCtx) {
        const { sock, msg, reply, isGroup, prefix = '.' } = cmdCtx || {};
        const rawArgs = Array.isArray(cmdCtx?.args) ? cmdCtx.args.slice() : String(cmdCtx?.args || '').split(/\s+/);
        let from = cmdCtx?.from;

        // ── Optional target: `.gcstatus <group jid> [text]` from ANY chat ──
        const targetJid = resolveTargetJid(rawArgs);
        if (targetJid) {
            const check = await assertBotInGroup(sock, targetJid);
            if (!check.ok) return reply(`❌ _${check.reason}_`, { raw: true });
            from = targetJid;
            rawArgs.shift();
        } else if (!isGroup) {
            return reply(
                '╭─❒ ◈ 𝗚𝗖𝗦𝗧𝗔𝗧𝗨𝗦 ❒\n│\n' +
                `│ ▸ ${prefix}gcstatus <text>          (inside a group)\n` +
                `│ ▸ ${prefix}gcstatus <group jid> <text>\n` +
                `│ ▸ ${prefix}gcstatus <group jid>     (reply to a message/media)\n` +
                '│\n' +
                `│ Get every jid with: ${prefix}groups\n` +
                '╰─⛧ Sukuna MD',
                { raw: true }
            );
        }

        const args = rawArgs.filter((value) => value !== undefined && value !== null);
        const caption = args.join(' ').trim();
        const parsedCaption = parseStatusColor(caption);
        const statusCaption = parsedCaption.text;
        const selectedColor = parsedCaption.color;
        const selectedBackground = selectedColor ? STATUS_RING_PALETTE[selectedColor] : TEXT_BG_COLOR;
        const ctx     = getQuotedCtx(msg);
        const quoted  = unwrapQuotedDeep(ctx?.quotedMessage || null);

        // ── IMAGE (or sticker treated as image) ──────────────────────────────
        const imgMsg = quoted?.imageMessage || quoted?.stickerMessage;
        if (imgMsg) {
            await reply('⏳ _Posting image to group status…_');
            try {
                const type = quoted.imageMessage ? 'image' : 'sticker';
                const buf  = await downloadMedia(imgMsg, type);
                await postGroupStatus(sock, from, {
                    image:   buf,
                    caption: statusCaption || '',
                    ringColor: selectedColor,
                });
                return reply(
                    `✅ *Posted to group status!*\n` +
                    `━━━━━━━━━━━━━━━━\n` +
                    `📸 Type: *Image*\n` +
                    (statusCaption ? `💬 Caption: _${statusCaption}_` : ``)
                );
            } catch (err) {
                return reply(`❌ _Failed to post image: ${err.message}_`);
            }
        }

        // ── VIDEO ────────────────────────────────────────────────────────────
        if (quoted?.videoMessage) {
            await reply('⏳ _Posting video to group status…_');
            try {
                const buf = await downloadMedia(quoted.videoMessage, 'video');
                await postGroupStatus(sock, from, {
                    video:   buf,
                    caption: statusCaption || '',
                    ringColor: selectedColor,
                });
                return reply(
                    `✅ *Posted to group status!*\n` +
                    `━━━━━━━━━━━━━━━━\n` +
                    `🎥 Type: *Video*\n` +
                    (statusCaption ? `💬 Caption: _${statusCaption}_` : ``)
                );
            } catch (err) {
                return reply(`❌ _Failed to post video: ${err.message}_`);
            }
        }

        // ── AUDIO ────────────────────────────────────────────────────────────
        if (quoted?.audioMessage) {
            await reply('⏳ _Posting audio to group status…_');
            try {
                const raw = await downloadMedia(quoted.audioMessage, 'audio');
                const buf = await encodeOpus(raw);
                
                // Post to group status
                await postGroupStatus(sock, from, {
                    audio:    buf,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt:      true,
                    ringColor: selectedColor,
                });

                // Also post to personal status
                const userJid = sock.user?.id;
                if (userJid) {
                    try {
                        await sock.sendMessage(userJid, {
                            audio:    buf,
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt:      true,
                        }, { statusJidList: [userJid] });
                    } catch (e) {
                        console.error('[gcstatus] failed to post audio to personal status:', e.message);
                    }
                }

                return reply(
                    `✅ *Posted to group status!*\n` +
                    `━━━━━━━━━━━━━━━━\n` +
                    `🎵 Type: *Audio*\n` +
                    `📢 Sent to: group status + your status`
                );
            } catch (err) {
                return reply(`❌ _Failed to post audio: ${err.message}_`);
            }
        }

        // ── QUOTED TEXT MESSAGE → post that text to group status ─────────────
        // This fires when you reply to any text message and run .gcstatus
        const quotedText =
            quoted?.conversation ||
            quoted?.extendedTextMessage?.text ||
            '';
        if (quoted && quotedText) {
            await reply('⏳ _Posting quoted message to group status…_');
            try {
                const isUrl = /https?:\/\//i.test(quotedText);

                // If the quoted message already had a link preview, relay it
                // through the existing preview path. Plain quoted text/URLs
                // retain the stable normal group-status behavior.
                const hasPreview = !!(quoted?.extendedTextMessage?.contextInfo?.externalAdReply);
                if (hasPreview) {
                    const quotedUrl = quotedText.match(/https?:\/\/[^\s]+/i)?.[0] || quotedText;
                    await postGroupStatusLinkPreview(sock, from, quotedUrl, selectedColor);
                } else {
                    await postGroupStatus(sock, from, {
                        text:            quotedText,
                        backgroundColor: isUrl ? (selectedColor ? selectedBackground : undefined) : selectedBackground,
                        ringColor: selectedColor,
                    });
                }
                return reply(
                    `✅ *Posted to group status!*\n` +
                    `━━━━━━━━━━━━━━━━\n` +
                    `💬 Type: *${isUrl ? 'Link' : 'Text'}*\n` +
                    `📝 _"${quotedText.slice(0, 60)}${quotedText.length > 60 ? '…' : ''}"_`
                );
            } catch (err) {
                return reply(`❌ _Failed to post: ${err.message}_`);
            }
        }

        // ── LINK PREVIEW RELAY (current message has a preview loaded) ────────
        const currentExt = msg.message?.extendedTextMessage;
        const currentCtx = currentExt?.contextInfo;
        const hasCurrentPreview = !!(currentCtx?.externalAdReply || currentExt?.matchedText);

        let relaySourceMessage    = null;
        let relaySourceContextInfo = null;

        if (hasCurrentPreview && !statusCaption) {
            relaySourceMessage     = { extendedTextMessage: currentExt };
            relaySourceContextInfo = currentCtx;
        } else if (quoted) {
            const extracted = extractRelaySourceMessage(quoted);
            if (extracted?.extendedTextMessage?.contextInfo?.externalAdReply) {
                relaySourceMessage     = extracted;
                relaySourceContextInfo = extractRelaySourceContextInfo(msg);
            }
        }

        if (relaySourceMessage) {
            await reply('⏳ _Posting link preview to group status…_');
            try {
                const previewUrl = String(
                    currentExt?.matchedText ||
                    currentExt?.canonicalUrl ||
                    relaySourceMessage?.extendedTextMessage?.matchedText ||
                    relaySourceMessage?.extendedTextMessage?.canonicalUrl ||
                    ''
                )
                    .match(/https?:\/\/[^\s]+/i)?.[0];
                if (previewUrl) {
                    await postGroupStatusLinkPreview(sock, from, previewUrl, selectedColor);
                } else {
                    await postRelayGroupStatus(sock, from, relaySourceMessage, relaySourceContextInfo, msg, selectedColor);
                }
                return reply(
                    `✅ *Posted to group status!*\n` +
                    `━━━━━━━━━━━━━━━━\n` +
                    `🔗 Type: *Link Preview*`
                );
            } catch (err) {
                return reply(`❌ _Failed to post link: ${err.message}_`);
            }
        }

        // ── TEXT / LINK (typed directly after .gcstatus) ─────────────────────
        if (!statusCaption) {
            await reply('⏳ _Preparing the native group invite preview…_');
            try {
                await postNativeGroupInviteStatus(sock, from);
                return reply('✅ *Native group invite preview posted to group status!*');
            } catch (err) {
                return reply(`❌ _Failed to post group invite preview: ${err.message}_`);
            }
        }

        try {
            await reply('⏳ _Posting to group status…_');
            const isUrl = /https?:\/\//i.test(statusCaption);

            if (isUrl) {
                await postGroupStatusLinkPreview(sock, from, statusCaption, selectedColor);
            } else {
                await postGroupStatus(sock, from, {
                    text:            statusCaption,
                    backgroundColor: selectedBackground,
                    ringColor: selectedColor,
                });
            }

            return reply(
                `✅ *Posted to group status!*\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `${isUrl ? '🔗' : '💬'} Type: *${isUrl ? 'Link' : 'Text'}*\n` +
                `📝 _"${statusCaption.slice(0, 60)}${statusCaption.length > 60 ? '…' : ''}"_`
            );
        } catch (err) {
            return reply(`❌ _Failed to post: ${err.message}_`);
        }
    },
});

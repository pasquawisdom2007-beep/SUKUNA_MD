/**
 * VVP Command — Reveal view-once to your private DM silently
 *
 * Reply to any view-once image/video/audio with .vvp
 * The bot sends the media to YOUR personal DM only — nobody in the
 * group sees anything happen (no reply, no reaction, completely silent).
 *
 * Built on the same robust engine as .vv
 */

'use strict';

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

// ── Shared helpers (same as vv.js) ────────────────────────────────────────────

function extractViewOnce(msgObj) {
    if (!msgObj || typeof msgObj !== 'object') return null;

    const wrapperKeys = [
        'viewOnceMessageV2Extension',
        'viewOnceMessageV2',
        'viewOnceMessage',
    ];

    for (const key of wrapperKeys) {
        if (msgObj[key]) {
            const inner = msgObj[key].message || msgObj[key];
            const result = findMedia(inner);
            if (result) return result;
        }
    }

    for (const val of Object.values(msgObj)) {
        if (val && typeof val === 'object' && !Buffer.isBuffer(val)) {
            for (const key of wrapperKeys) {
                if (val[key]) {
                    const inner = val[key].message || val[key];
                    const result = findMedia(inner);
                    if (result) return result;
                }
            }
        }
    }

    return null;
}

function findMedia(msgObj) {
    if (!msgObj) return null;
    if (msgObj.imageMessage)    return { mediaType: 'image',    mediaMsg: msgObj.imageMessage };
    if (msgObj.videoMessage)    return { mediaType: 'video',    mediaMsg: msgObj.videoMessage };
    if (msgObj.audioMessage)    return { mediaType: 'audio',    mediaMsg: msgObj.audioMessage };
    if (msgObj.documentMessage) return { mediaType: 'document', mediaMsg: msgObj.documentMessage };
    return null;
}

async function downloadMedia(mediaMsg, mediaType, retries = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            if (buf.length === 0) throw new Error('Empty buffer received');
            return buf;
        } catch (err) {
            lastErr = err;
            if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    throw lastErr;
}

function getQuotedMessage(msg) {
    const msgContent = msg.message;
    if (!msgContent) return null;

    const contextInfo =
        msgContent?.extendedTextMessage?.contextInfo     ||
        msgContent?.imageMessage?.contextInfo            ||
        msgContent?.videoMessage?.contextInfo            ||
        msgContent?.audioMessage?.contextInfo            ||
        msgContent?.documentMessage?.contextInfo         ||
        msgContent?.stickerMessage?.contextInfo          ||
        msgContent?.buttonsResponseMessage?.contextInfo  ||
        msgContent?.listResponseMessage?.contextInfo     ||
        msgContent?.templateButtonReplyMessage?.contextInfo ||
        null;

    return contextInfo?.quotedMessage || null;
}

// ── Command ───────────────────────────────────────────────────────────────────

module.exports = {
    name:        'vvp',
    aliases:     ['vvprivate', 'pvv'],
    category:    'fun',
    description: 'Send a view-once privately to your DM (silent — nobody sees)',
    usage:       '.vvp (reply to a view-once message)',

    async execute({ sock, msg, from, sender, phoneNumber, reply, isOwner }) {

        // ── 1. Owner only — this is a stealth command ─────────────────────
        if (!isOwner) {
            return reply(`🔒 _This command is for the bot owner only._`);
        }

        // ── 2. Get quoted message ─────────────────────────────────────────
        const quotedMsg = getQuotedMessage(msg);

        if (!quotedMsg) {
            return reply(
                `👁️ *VVP — Private Reveal*\n\n` +
                `❌ Reply to a *view-once message* first.\n\n` +
                `_How to use:_\n` +
                `1. Long-press a view-once → Reply\n` +
                `2. Type *.vvp* and send\n\n` +
                `_The media will be sent to your DM only — silently._`
            );
        }

        // ── 3. Extract view-once media ────────────────────────────────────
        let found = extractViewOnce(quotedMsg) || findMedia(quotedMsg);

        if (!found) {
            return reply(
                `👁️ *VVP*\n\n` +
                `❌ That message is *not a view-once*.\n` +
                `_Only view-once images, videos and audio can be revealed._`
            );
        }

        const { mediaType, mediaMsg } = found;
        if (!mediaType || !mediaMsg) {
            return reply(`👁️ *VVP*\n\n❌ Could not find media in that message.`);
        }

        // ── 4. Download ───────────────────────────────────────────────────
        let buffer;
        try {
            buffer = await downloadMedia(mediaMsg, mediaType);
        } catch (err) {
            console.error('[VVP] Download error:', err.message);

            if (/not found|404/i.test(err.message)) {
                return reply(
                    `👁️ *VVP*\n\n⌛ *Expired.* WhatsApp deleted this media after it was opened.\n` +
                    `_Reveal it before opening next time._`
                );
            }
            return reply(`👁️ *VVP*\n\n❌ Download failed: _${err.message}_`);
        }

        // ── 5. Owner's personal DM JID ────────────────────────────────────
        const ownerJid = `${phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`;

        const dmCaption =
            `╔══════════════════════════════╗\n` +
            `║  👁️  *VIEW ONCE — PRIVATE*    ║\n` +
            `╚══════════════════════════════╝\n\n` +
            `📍 *From:* ${from.endsWith('@g.us') ? 'Group' : 'DM'}\n` +
            `> _𝘚𝘦𝘯𝘵 𝘴𝘪𝘭𝘦𝘯𝘵𝘭𝘺 𝘣𝘺 𝘚𝘶𝘬𝘶𝘯𝘢 𝘔𝘋_ 👹`;

        // ── 6. Send to private DM ─────────────────────────────────────────
        try {
            if (mediaType === 'image') {
                await sock.sendMessage(ownerJid, {
                    image:   buffer,
                    caption: dmCaption
                });

            } else if (mediaType === 'video') {
                await sock.sendMessage(ownerJid, {
                    video:    buffer,
                    caption:  dmCaption,
                    mimetype: mediaMsg.mimetype || 'video/mp4'
                });

            } else if (mediaType === 'audio') {
                await sock.sendMessage(ownerJid, {
                    audio:    buffer,
                    mimetype: mediaMsg.mimetype || 'audio/ogg; codecs=opus',
                    ptt:      !!mediaMsg.ptt
                });
                await sock.sendMessage(ownerJid, { text: dmCaption });

            } else if (mediaType === 'document') {
                await sock.sendMessage(ownerJid, {
                    document: buffer,
                    mimetype: mediaMsg.mimetype || 'application/octet-stream',
                    fileName: mediaMsg.fileName || 'revealed_file',
                    caption:  dmCaption
                });
            }

            // ── 7. Silent: only confirm to the SENDER in their own DM ─────
            // If the command was used in a group, reply quietly to the owner's
            // DM (never in the group) so no one else sees the confirmation.
            if (from !== ownerJid) {
                await sock.sendMessage(ownerJid, {
                    text: `✅ _View-once ${mediaType} sent to your DM (private). Nobody saw this._`
                });
            }

        } catch (err) {
            console.error('[VVP] Send error:', err.message);
            return reply(`👁️ *VVP*\n\n❌ Failed to send to DM: _${err.message}_`);
        }
    }
};

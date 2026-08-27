/**
 * VV Command — Reveal view-once messages
 * Supports all Baileys view-once formats (v1, v2, v2Extension)
 * Reply to any view-once image/video/audio with .vv to reveal it
 * Usage: .vv (reply to a view-once message)
 */

const { extractViewOnce, findMedia, downloadMedia } = require('../../utils/viewOnce');

/**
 * Extract the quoted / replied-to message from a message object.
 * Checks all known contextInfo locations in Baileys.
 */
function getQuotedMessage(msg) {
    const msgContent = msg.message;
    if (!msgContent) return null;

    // All possible paths where contextInfo can live
    const contextInfo =
        msgContent?.extendedTextMessage?.contextInfo ||
        msgContent?.imageMessage?.contextInfo       ||
        msgContent?.videoMessage?.contextInfo       ||
        msgContent?.audioMessage?.contextInfo       ||
        msgContent?.documentMessage?.contextInfo    ||
        msgContent?.stickerMessage?.contextInfo     ||
        msgContent?.buttonsResponseMessage?.contextInfo ||
        msgContent?.listResponseMessage?.contextInfo ||
        msgContent?.templateButtonReplyMessage?.contextInfo ||
        null;

    return contextInfo?.quotedMessage || null;
}

module.exports = {
    name: 'vv',
    aliases: ['viewonce', 'reveal', 'vo'],
    description: 'Reveal a view-once image, video, or audio',
    usage: '.vv (reply to a view-once message)',
    category: 'fun',

    async execute({ sock, msg, from, reply }) {
        // ── 1. Get the quoted message ─────────────────────────────────────
        const quotedMsg = getQuotedMessage(msg);

        if (!quotedMsg) {
            return reply(
                `👁️ *VIEW ONCE REVEAL*\n\n` +
                `❌ You need to *reply to a view-once message* first.\n\n` +
                `_How to use:_\n` +
                `1. Find a view-once image or video\n` +
                `2. Long-press it → Reply\n` +
                `3. Type *.vv* and send`
            );
        }

        // ── 2. Find the view-once content ─────────────────────────────────
        const found = extractViewOnce(quotedMsg);

        if (!found) {
            // Try treating the quoted message directly as media (some clients
            // send view-once without the wrapper in the quoted message context)
            const directMedia = findMedia(quotedMsg);
            if (!directMedia) {
                return reply(
                    `👁️ *VIEW ONCE REVEAL*\n\n` +
                    `❌ That message is *not a view-once message*.\n\n` +
                    `_Only view-once images and videos can be revealed._`
                );
            }
            // Use direct media if no view-once wrapper found
            Object.assign(found || {}, directMedia);
        }

        const { mediaType, mediaMsg } = found || (() => {
            // Fallback: try direct media one more time
            return findMedia(quotedMsg) || {};
        })();

        if (!mediaType || !mediaMsg) {
            return reply(
                `👁️ *VIEW ONCE REVEAL*\n\n` +
                `❌ Could not find media in that message.\n\n` +
                `_Only view-once images and videos can be revealed._`
            );
        }

        // ── 3. Download and re-send (clean, no text) ───────────────────────
        try {
            const buffer = await downloadMedia(mediaMsg, mediaType);

            if (mediaType === 'image') {
                await sock.sendMessage(from, {
                    image: buffer,
                }, { quoted: msg });

            } else if (mediaType === 'video') {
                await sock.sendMessage(from, {
                    video: buffer,
                    mimetype: mediaMsg.mimetype || 'video/mp4',
                }, { quoted: msg });

            } else if (mediaType === 'audio') {
                await sock.sendMessage(from, {
                    audio: buffer,
                    mimetype: mediaMsg.mimetype || 'audio/ogg; codecs=opus',
                    ptt: !!mediaMsg.ptt,
                }, { quoted: msg });

            } else if (mediaType === 'document') {
                await sock.sendMessage(from, {
                    document: buffer,
                    mimetype: mediaMsg.mimetype || 'application/octet-stream',
                    fileName: mediaMsg.fileName || 'file',
                }, { quoted: msg });
            }

        } catch (err) {
            console.error('[VV] Download failed:', err.message);

            if (err.message?.includes('Not Found') || err.message?.includes('404')) {
                return reply(
                    `👁️ *VIEW ONCE REVEAL*\n\n` +
                    `⌛ *Message expired or already deleted.*\n\n` +
                    `_WhatsApp deletes view-once media after it has been opened.\n` +
                    `Try revealing it before opening the view-once._`
                );
            }

            return reply(
                `👁️ *VIEW ONCE REVEAL*\n\n` +
                `❌ *Failed to reveal the message.*\n\n` +
                `_Reason: ${err.message}_\n\n` +
                `_Make sure the media hasn't expired and try again._`
            );
        }
    }
};

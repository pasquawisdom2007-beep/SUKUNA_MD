/**
 * globalstatus — Post text, link, image, video or audio to the status feed
 * of EVERY group the bot is currently a member of.
 *
 * Like gcstatus / gcstatusdm, but instead of one group it fans the post
 * out to *all* groups the bot is in. Uses the same @pasqua-baileys/baileys
 * groupStatusMessageV2 pipeline as gcstatus.js (downloadMedia, postGroupStatus,
 * fetchLinkPreview, encodeOpus) so behaviour/quality matches gcstatus exactly —
 * it's just looped across every group.
 *
 * Owner-only. Works in DM *or* inside a group. Usage:
 *   .global status Hello world!            → text status → every group
 *   .global status https://example.com     → link status → every group
 *   Reply to a message + .global status    → posts that message → every group
 *   Reply to a photo  + .global status [caption]
 *   Reply to a video  + .global status [caption]
 *   Reply to an audio + .global status
 *
 * (command name is "global" with a "status" sub-argument, so ".global status ..."
 *  is typed exactly as requested — .globalstatus also works as a one-word alias)
 *
 * Lives in commands/owner/ so the bot's built-in owner-only guard
 * (sessionManager: `command.category === 'owner'`) applies automatically.
 * There's also an explicit isOwner check below as a second layer of defense.
 */

'use strict';

// Small gap between each group post so we don't hammer WhatsApp / trip anti-spam.
const DELAY_BETWEEN_GROUPS_MS = 1200;

// Lazily require gcstatus.js's helpers INSIDE execute() rather than at the
// top of the file. If this require ever fails (wrong path, missing baileys
// package, etc.), a top-level require would throw during command loading —
// the whole command silently disappears from the bot with zero error shown
// anywhere. Deferring it here means the command always registers, and if
// something is broken you get a clear error message instead of dead silence.
function loadGcstatus() {
    const gcstatus = require('../general/gcstatus');
    const {
        downloadMedia,
        fetchLinkPreview,
        postGroupStatus,
        encodeOpus,
        getQuotedCtx,
        unwrapQuotedDeep,
        TEXT_BG_COLOR,
    } = gcstatus;
    return { downloadMedia, fetchLinkPreview, postGroupStatus, encodeOpus, getQuotedCtx, unwrapQuotedDeep, TEXT_BG_COLOR };
}

function helpText() {
    return (
        `🌍 *Global Status — Post to ALL Group Statuses*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Usage (DM or group, owner only):*\n` +
        `› \`.global status Hello world!\`  — text status\n` +
        `› \`.global status https://link.com\`  — link/preview status\n` +
        `› Reply to 📷 photo + \`.global status [caption]\`\n` +
        `› Reply to 🎥 video + \`.global status [caption]\`\n` +
        `› Reply to 🎵 audio + \`.global status\`\n` +
        `› Reply to 💬 any message + \`.global status\`\n\n` +
        `_Posts to the status feed of every group the bot is currently in._\n` +
        `_Alias: \`.globalstatus\` (no space) works the same way._`
    );
}

module.exports = {
    name:        'global',
    aliases:     ['globalstatus', 'gstatusall', 'allgroupstatus'],
    description: 'Post text, link, image, video or audio to the status feed of every group the bot is in',
    usage:       '.global status <text|link>  OR  reply to any message + .global status [caption]',
    category:    'owner',
    ownerOnly:   true,

    async execute({ sock, msg, from, args, reply, isOwner }) {
        // Owner-only, on top of the automatic category:'owner' guard in
        // sessionManager.js (which already lets mods through too, via
        // context.isOwner = senderIsOwner || senderIsMod) — this is just a
        // second layer of defense in case the file ever moves categories.
        if (!isOwner) {
            return reply('🔒 *This command is reserved for the bot owner only.*');
        }

        let helpers;
        try {
            helpers = loadGcstatus();
        } catch (err) {
            console.error('[global status] failed to load gcstatus helpers:', err);
            return reply(`❌ *Global status is misconfigured:* _${err.message}_\n\nCheck the console log for the full error.`);
        }
        const {
            downloadMedia, fetchLinkPreview, postGroupStatus,
            encodeOpus, getQuotedCtx, unwrapQuotedDeep, TEXT_BG_COLOR,
        } = helpers;

        // Works in DM AND inside groups — no isGroup restriction.

        // Support both ".global status ..." and ".globalstatus ..." (alias).
        // When invoked via the "global" name, the first arg must be "status".
        let rest = args;
        if (args[0] && args[0].toLowerCase() === 'status') {
            rest = args.slice(1);
        } else if (args.length) {
            // Called as ".global <something else>" — show help instead of guessing.
            return reply(helpText());
        }

        const caption = rest.join(' ').trim();
        const ctx     = getQuotedCtx(msg);
        const quoted  = unwrapQuotedDeep(ctx?.quotedMessage || null);

        // Need either a caption/link or a quoted message to post.
        if (!caption && !quoted) {
            return reply(helpText());
        }

        // ── Resolve every group the bot is currently in ────────────────────
        let groupsMap;
        try {
            groupsMap = await sock.groupFetchAllParticipating();
        } catch (err) {
            return reply(`❌ _Failed to fetch bot's groups: ${err.message}_`);
        }
        const groupIds = Object.keys(groupsMap || {});
        if (!groupIds.length) {
            return reply('❌ *The bot is not currently in any groups.*');
        }

        async function postToAllGroups(buildContent, label) {
            await reply(`🌍 _Posting *${label}* status to *${groupIds.length}* group(s)…_`);
            let sent = 0;
            let failed = 0;
            for (const gid of groupIds) {
                try {
                    await postGroupStatus(sock, gid, buildContent());
                    sent++;
                } catch (err) {
                    failed++;
                    console.error(`[global status] failed for ${gid}:`, err.message);
                }
                await new Promise((r) => setTimeout(r, DELAY_BETWEEN_GROUPS_MS));
            }
            return reply(
                `✅ *Global Status Complete!*\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `📢 Type: *${label}*\n` +
                `✅ Sent: ${sent}\n` +
                (failed ? `❌ Failed: ${failed}\n` : ``) +
                `📊 Total groups: ${groupIds.length}`
            );
        }

        // ── IMAGE (or sticker treated as image) ─────────────────────────────
        const imgMsg = quoted?.imageMessage || quoted?.stickerMessage;
        if (imgMsg) {
            try {
                const type = quoted.imageMessage ? 'image' : 'sticker';
                const buf  = await downloadMedia(imgMsg, type);
                return postToAllGroups(() => ({ image: buf, caption: caption || '' }), 'Image');
            } catch (err) {
                return reply(`❌ _Failed to download image: ${err.message}_`);
            }
        }

        // ── VIDEO ─────────────────────────────────────────────────────────
        if (quoted?.videoMessage) {
            try {
                const buf = await downloadMedia(quoted.videoMessage, 'video');
                return postToAllGroups(() => ({ video: buf, caption: caption || '' }), 'Video');
            } catch (err) {
                return reply(`❌ _Failed to download video: ${err.message}_`);
            }
        }

        // ── AUDIO ─────────────────────────────────────────────────────────
        if (quoted?.audioMessage) {
            try {
                const raw = await downloadMedia(quoted.audioMessage, 'audio');
                const buf = await encodeOpus(raw);
                return postToAllGroups(() => ({
                    audio:    buf,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt:      true,
                }), 'Audio');
            } catch (err) {
                return reply(`❌ _Failed to download audio: ${err.message}_`);
            }
        }

        // ── QUOTED TEXT MESSAGE (reply to text + .global status, no caption) ─
        const quotedText =
            quoted?.conversation ||
            quoted?.extendedTextMessage?.text ||
            '';
        if (quoted && quotedText && !caption) {
            const isUrl = /https?:\/\//i.test(quotedText);
            if (isUrl) {
                const preview = await fetchLinkPreview(quotedText);
                return postToAllGroups(() => ({
                    text:        quotedText,
                    richPreview: true,
                    ...(preview.title       ? { previewTitle:       preview.title }       : {}),
                    ...(preview.description ? { previewDescription: preview.description } : {}),
                    ...(preview.imageBuffer ? { previewImage:       preview.imageBuffer } : {}),
                }), 'Link');
            }
            return postToAllGroups(() => ({
                text:            quotedText,
                backgroundColor: TEXT_BG_COLOR,
            }), 'Text');
        }

        // ── TEXT / LINK typed directly after "status" ───────────────────────
        if (!caption) {
            return reply(helpText());
        }

        const isUrl = /https?:\/\//i.test(caption);
        if (isUrl) {
            const preview = await fetchLinkPreview(caption);
            return postToAllGroups(() => ({
                text:        caption,
                richPreview: true,
                ...(preview.title       ? { previewTitle:       preview.title }       : {}),
                ...(preview.description ? { previewDescription: preview.description } : {}),
                ...(preview.imageBuffer ? { previewImage:       preview.imageBuffer } : {}),
            }), 'Link');
        }

        return postToAllGroups(() => ({
            text:            caption,
            backgroundColor: TEXT_BG_COLOR,
        }), 'Text');
    },
};

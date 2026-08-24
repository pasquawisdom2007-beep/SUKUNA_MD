/**
 * Peek Command — SUKUNA MD
 * Usage : .peek <invite link>
 *         .peek            (reply to a message containing the link)
 *
 * Resolves a WhatsApp group invite link to its real name, description,
 * member count, and creator — WITHOUT joining the group. Uses Baileys'
 * native groupGetInviteInfo(code), the same lookup WhatsApp's own client
 * performs to render the "About this group" preview before you tap Join.
 * No join event fires, nothing is written, nothing changes on either side.
 */

'use strict';

const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

function ctaUrl(displayText, url) {
    return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: url }),
    };
}

function ctaCopy(displayText, id, value) {
    return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({ display_text: displayText, id, copy_code: value }),
    };
}

async function sendPreviewActions({ sock, msg, from, title, url, primaryLabel }) {
    const buttons = [
        ctaUrl(primaryLabel, url),
        ctaCopy('Copy Link', `peek_copy_${Date.now()}`, url),
    ];
    try {
        const interactive = {
            body: { text: `${title}\n\nChoose an action below:` },
            footer: { text: 'SUKUNA MD · PEEK' },
            header: { title: `✦ ${title} ✦`, hasMediaAttachment: false },
            nativeFlowMessage: { buttons, messageParamsJson: '' },
        };
        const wrapped = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactive),
                },
            },
        }, {
            userJid: sock.user?.id,
            ...(msg?.message ? { quoted: msg } : {}),
        });
        await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
    } catch (error) {
        console.error('[peek:buttons]', error?.message || error);
        await sock.sendMessage(from, { text: `${primaryLabel}: ${url}\nCopy link: ${url}` }, { quoted: msg });
    }
}

function formatCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('en-US') : String(value || 'Unknown');
}

async function previewChannel({ sock, msg, from, text, prefix = '.' }) {
    const match = text.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
    if (!match || !match[1] || match[1].length < 8) return null;
    if (typeof sock.newsletterMetadata !== 'function') {
        throw new Error('this Baileys build does not expose newsletter channel metadata');
    }

    let info;
    try {
        info = await sock.newsletterMetadata('invite', match[1]);
    } catch (err) {
        console.error('[peek:channel]', err?.message || err);
        const errMsg = err?.toString?.() || '';
        if (errMsg.includes('404') || errMsg.includes('not-found')) throw new Error('Invalid or unavailable channel link');
        if (errMsg.includes('401') || errMsg.includes('403')) throw new Error('Not authorized to preview this channel');
        throw new Error('Could not resolve this channel link');
    }
    if (!info?.id) throw new Error('Channel metadata was unavailable');

    const channelName = info.name || info.subject || 'Unknown channel';
    const followers = formatCount(info.subscribers ?? info.subscriberCount ?? 'Unknown');
    const description = String(info.description || info.desc || 'No description set').trim();
    const createdAt = info.creation_time || info.creation
        ? new Date(Number(info.creation_time || info.creation) * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : 'Unknown';
    const verificationValue = String(info.verification || '').toLowerCase();
    const verification = info.isVerified === true || ['verified', 'blue', 'green'].includes(verificationValue)
        ? 'Verified'
        : info.verification
            ? String(info.verification)
            : 'Not verified';
    const channelUrl = `https://whatsapp.com/channel/${match[1]}`;
    const out =
        `📡 *CHANNEL PREVIEW*\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `📛 *Name :* ${channelName}\n` +
        `👥 *Followers :* ${followers}\n` +
        `✅ *Status :* ${verification}\n` +
        `📅 *Created :* ${createdAt}\n` +
        `🔗 *Link :* ${channelUrl}\n` +
        `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
        `📝 *Description :*\n${description}\n\n` +
        `> Previewed only — not followed.`;

    let profileUrl = null;
    if (typeof sock.profilePictureUrl === 'function') {
        try { profileUrl = await sock.profilePictureUrl(info.id, 'image'); } catch (_) {}
    }
    if (profileUrl) {
        await sock.sendMessage(from, { image: { url: profileUrl }, caption: out }, { quoted: msg });
    } else {
        await sock.sendMessage(from, { text: out }, { quoted: msg });
    }
    await sendPreviewActions({ sock, msg, from, title: 'CHANNEL ACTIONS', url: channelUrl, primaryLabel: 'Follow Channel' });
    return true;
}

module.exports = {
    name: 'peek',
    aliases: ['ginfo', 'inviteinfo', 'groupinvitepreview'],
    description: 'Preview a WhatsApp group invite link without joining',
    category: 'group',

    async execute({ sock, msg, from, args, reply, prefix = '.' }) {
        try {
            // ── Get text from args or a replied-to message ────────────
            let text = args.join(' ').trim();

            if (!text && msg.quoted) {
                text = msg.quoted?.text?.trim() ||
                       msg.quoted?.caption?.trim() || '';
            }

            if (!text) {
                return reply(
                    `🔎 *PEEK — GROUP PREVIEW*\n` +
                    `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
                    `Usage:\n` +
                    `${prefix}peek https://chat.whatsapp.com/XXXXXXXX\n` +
                    `or reply to a message containing the link\n\n` +
                    `You can also use a public channel link:\n` +
                    `${prefix}peek https://whatsapp.com/channel/XXXXXXXX\n\n` +
                    `> Shows name, description, member count & creator —\n` +
                    `> without joining the group.`
                );
            }

            // ── Public channel preview uses the same metadata + profile-photo flow ──
            if (/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\//i.test(text)) {
                await previewChannel({ sock, msg, from, text, prefix });
                return;
            }

            // ── Extract invite code from the link ──────────────────────
            const match = text.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
            if (!match || !match[1]) {
                return reply(
                    `❌ *Invalid link format*\n\n` +
                    `Expected: https://chat.whatsapp.com/[CODE]`
                );
            }

            const code = match[1].split('?')[0]; // strip ?mode=gi_t etc.
            if (code.length < 15) {
                return reply('❌ *Invalid invite code*');
            }

            // ── Resolve invite WITHOUT joining ──────────────────────────
            let info;
            try {
                info = await sock.groupGetInviteInfo(code);
            } catch (err) {
                console.error('[peek]', err?.message || err);
                const errMsg = err?.toString?.() || '';
                let reason = 'Could not resolve this invite link';

                if (errMsg.includes('404') || errMsg.includes('not-authorized')) reason = 'Invalid or revoked link';
                else if (errMsg.includes('410') || errMsg.includes('gone')) reason = 'Link has expired';
                else if (errMsg.includes('401')) reason = 'Not authorized to preview this link';
                else if (errMsg.includes('408')) reason = 'Request timed out — try again';
                else if (errMsg.includes('500')) reason = 'Server error — try later';

                return reply(`❌ ${reason}`);
            }

            const groupName   = info?.subject || 'Unknown';
            const memberCount = info?.size ?? info?.participants?.length ?? 'Unknown';
            const description = info?.desc?.trim() || 'No description set';
            const creator      = info?.owner || info?.subjectOwner || null;
            const createdAt    = info?.creation
                ? new Date(info.creation * 1000).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                  })
                : 'Unknown';

            let out =
                `🔎 *GROUP PREVIEW*\n` +
                `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
                `📛 *Name :* ${groupName}\n` +
                `👥 *Members :* ${memberCount}\n` +
                `📅 *Created :* ${createdAt}\n`;

            if (creator) {
                out += `👤 *Creator :* @${creator.split('@')[0]}\n`;
            }

            out +=
                `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
                `📝 *Description :*\n${description}\n\n` +
                `> Previewed only — not joined.`;

            // Invite previews can expose the group id even when the bot has not joined.
            // Try to retrieve the current profile photo; if WhatsApp denies the lookup,
            // preserve the preview and fall back to text-only delivery.
            const groupId = info?.id || info?.gid || info?.groupId || null;
            let profileUrl = null;
            if (groupId && typeof sock.profilePictureUrl === 'function') {
                try { profileUrl = await sock.profilePictureUrl(groupId, 'image'); } catch (_) {}
            }

            // reply() doesn't support mentions — send via sock directly so
            // the creator tag actually resolves instead of showing as plain text.
            if (profileUrl) {
                await sock.sendMessage(
                    from,
                    { image: { url: profileUrl }, caption: out, mentions: creator ? [creator] : [] },
                    { quoted: msg }
                );
            } else {
                await sock.sendMessage(
                    from,
                    { text: out, mentions: creator ? [creator] : [] },
                    { quoted: msg }
                );
            }
            await sendPreviewActions({ sock, msg, from, title: 'GROUP ACTIONS', url: `https://chat.whatsapp.com/${code}`, primaryLabel: 'Join Group' });

        } catch (err) {
            console.error('[peek]', err?.message || err);
            reply('❌ Failed to preview this group.');
        }
    }
};

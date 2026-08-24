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
                    `> Shows name, description, member count & creator —\n` +
                    `> without joining the group.`
                );
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

        } catch (err) {
            console.error('[peek]', err?.message || err);
            reply('❌ Failed to preview this group.');
        }
    }
};

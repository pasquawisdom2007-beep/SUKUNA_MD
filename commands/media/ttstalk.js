/**
 * .ttstalk <username> — get info on a TikTok account
 *
 * Reads the public TikTok profile page first, where TikTok exposes structured
 * profile data without an API key. Falls back to tikwm only if the public page
 * is unavailable. Returns profile + stats and the avatar image when available.
 */
'use strict';
const { cleanUsername, fetchTikTokProfile } = require('../../lib/tiktokProfile');

function fmt(n) {
    if (n === null || n === undefined || n === '') return null;
    const num = typeof n === 'string' ? parseFloat(n.replace(/[^\d.]/g, '')) : n;
    if (!Number.isFinite(num)) return String(n);
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return String(num);
}

async function stalk(username) {
    return fetchTikTokProfile(username);
}

module.exports = {
    name: 'ttstalk',
    aliases: ['tiktokstalk', 'ttinfo'],
    description: 'Get info on a TikTok account',
    category: 'media',
    usage: '.ttstalk <username>',

    async execute({ sock, msg, from, reply, args }) {
        const username = cleanUsername((args || []).join(' '));
        if (!username) {
            return reply(
                `📱 *TikTok Stalk*\n\n` +
                `Usage: .ttstalk <username>\n` +
                `Example: .ttstalk charlidamelio`
            );
        }

        try {
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }).catch(() => {});

            const info = await stalk(username);
            if (!info) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
                return reply(`❌ Couldn't find TikTok account *@${username}*. Double-check the username.`);
            }

            let out = `📱 *TikTok Account*\n\n`;
            out += `👤 *${info.nickname}*${info.verified ? ' ✅' : ''}\n`;
            out += `🔗 @${info.handle}\n`;
            if (info.bio) out += `📝 ${info.bio}\n`;
            out += `\n`;
            if (fmt(info.followers) !== null) out += `👥 Followers: *${fmt(info.followers)}*\n`;
            if (fmt(info.following) !== null) out += `➡️ Following: *${fmt(info.following)}*\n`;
            if (fmt(info.likes)     !== null) out += `❤️ Likes: *${fmt(info.likes)}*\n`;
            if (fmt(info.videos)    !== null) out += `🎥 Videos: *${fmt(info.videos)}*\n`;

            if (info.avatar && /^https?:\/\//.test(info.avatar)) {
                try {
                    await sock.sendMessage(from, { image: { url: info.avatar }, caption: out }, { quoted: msg });
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
                    return;
                } catch (_) { /* fall through to text-only */ }
            }

            await reply(out);
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (err) {
            console.error('[ttstalk] error:', err.message);
            try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch {}
            reply('❌ TikTok lookup failed. Try again later.');
        }
    },
};

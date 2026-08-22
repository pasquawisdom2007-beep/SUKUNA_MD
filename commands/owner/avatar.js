/**
 * Avatar — Generate random profile pic suggestions for the owner.
 *
 * Usage:
 *   .avatar               → sends 3 random portraits (Unsplash) to pick from
 *   .avatar <query>       → custom theme, e.g. .avatar anime
 *   .avatar use           → reply to one of the sent images with `.avatar use`
 *                           to set it as the bot/owner profile picture.
 *
 * Owner only.
 *
 * Uses the keyless Unsplash Source endpoint
 *   https://source.unsplash.com/<size>/?<query>
 * so it works with zero API keys. We bust the cache with a random sig so each
 * call yields different images.
 */
'use strict';

const { downloadMediaMessage } = require('@pasqua-baileys/baileys');

const DEFAULT_QUERIES = ['portrait', 'face', 'person', 'model', 'aesthetic'];

function rand(n) { return Math.floor(Math.random() * n); }
function pickQuery(arg) {
    const q = (arg || '').trim();
    if (q) return q;
    return DEFAULT_QUERIES[rand(DEFAULT_QUERIES.length)];
}

async function fetchUnsplash(query) {
    // Random signature forces a fresh image each call
    const sig = Math.random().toString(36).slice(2, 10);
    const url = `https://source.unsplash.com/600x600/?${encodeURIComponent(query)}&sig=${sig}`;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Unsplash ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
}

module.exports = {
    name: 'avatar',
    aliases: ['randompp', 'avatars', 'pfp'],
    description: 'Get random profile-pic suggestions for the owner',
    category: 'owner',

    async execute({ sock, msg, from, args, reply, isOwner }) {
        if (!isOwner) return reply('❌ Only the bot owner can use this command.');

        // ── Subcommand: .avatar use (reply to a previously sent image) ──
        if ((args[0] || '').toLowerCase() === 'use') {
            const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const target = quoted;
            if (!target?.imageMessage) {
                return reply('❌ Reply to one of the avatar images with *.avatar use*');
            }
            try {
                await reply('⏳ Setting that avatar as your profile picture...');
                const buffer = await downloadMediaMessage(
                    { message: target, key: msg.key },
                    'buffer',
                    {}
                );
                const botJid = sock.user?.id;
                await sock.updateProfilePicture(botJid, buffer);
                return reply(
                    `╭─❒ ◈ 𝙎𝙐𝙆𝙐᳇𝘼 ❒\n` +
                    `│ ✅ *Profile picture updated!*\n` +
                    `╰─⛧ pasqua verified`
                );
            } catch (e) {
                console.error('[avatar use]', e.message);
                return reply('❌ Failed to set that avatar.');
            }
        }

        // ── Default: send 3 random portraits ──
        const query = pickQuery(args.join(' '));
        await reply(`🎲 Fetching 3 random *${query}* avatars... reply *.avatar use* to one to apply it.`);

        const results = await Promise.allSettled([
            fetchUnsplash(query),
            fetchUnsplash(query),
            fetchUnsplash(query),
        ]);

        let sent = 0;
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.status !== 'fulfilled') continue;
            try {
                await sock.sendMessage(from, {
                    image:   r.value,
                    caption: `🖼️ *Avatar option ${i + 1}* — _${query}_\n\n_Reply to this with_ *.avatar use* _to apply._`,
                }, { quoted: msg });
                sent++;
            } catch (e) {
                console.error('[avatar send]', e.message);
            }
        }

        if (!sent) return reply('❌ Failed to fetch avatars. Try again or use a different query.');
    },
};

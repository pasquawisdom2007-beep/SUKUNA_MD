/**
 * .listinactive — tag all INACTIVE members with their message counts.
 *
 * Inactive = has NOT sent a message within the active window (default 7 days,
 * override with `.listinactive <days>`). This includes members the bot has
 * never seen talk (0 messages). Every inactive member is tagged so admins can
 * nudge or review them.
 *
 * Usage: .listinactive [days]
 */
'use strict';

const { computeActivity, timeAgo, DEFAULT_WINDOW_DAYS } = require('../../lib/groupActivity');

module.exports = {
    name: 'listinactive',
    aliases: ['inactivelist', 'lurkerlist'],
    description: 'Tag inactive members with their message counts',
    category: 'group',

    async execute({ sock, msg, from, reply, args, isGroup, database }) {
        if (!isGroup) return reply('👥 This command can only be used in groups!');

        const windowDays = Math.max(1, parseInt(args[0], 10) || DEFAULT_WINDOW_DAYS);

        try {
            await sock.sendMessage(from, { react: { text: '📊', key: msg.key } }).catch(() => {});
            const { inactive, total, groupName } = await computeActivity(sock, from, database, windowDays);

            if (!inactive.length) {
                return reply(
                    `🎉 *Everyone is active!*\n\n` +
                    `All *${total}* members have chatted within the last *${windowDays}* day(s).`
                );
            }

            const divider = '▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰';
            let text =
                `${divider}\n` +
                `👻 *INACTIVE MEMBERS* — ${groupName}\n` +
                `${divider}\n\n` +
                `🪟 Window: last *${windowDays}* day(s)\n` +
                `💤 Inactive: *${inactive.length}* / ${total}\n\n`;

            inactive.forEach((m, i) => {
                const seen = m.lastSeen ? timeAgo(m.lastSeen) : 'never seen';
                text += `${i + 1}. @${m.num}${m.isAdmin ? ' 👑' : ''}\n`;
                text += `   💬 ${m.count} msg${m.count === 1 ? '' : 's'} • 🕒 ${seen}\n`;
            });

            text +=
                `\n${divider}\n` +
                `📢 Time to say hi! 👋\n` +
                `> SUKUNA MD`;

            await sock.sendMessage(from, { text, mentions: inactive.map(m => m.jid) }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (err) {
            console.error('[listinactive] error:', err.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            reply(`❌ Failed to list inactive members: ${err.message}`);
        }
    },
};

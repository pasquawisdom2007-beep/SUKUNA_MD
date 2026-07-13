/**
 * .listactive — list all ACTIVE members with their message counts.
 *
 * Active = sent at least one message within the active window (default 7 days,
 * override with `.listactive <days>`). Members are tagged so their names show.
 *
 * Usage: .listactive [days]
 */
'use strict';

const { computeActivity, timeAgo, DEFAULT_WINDOW_DAYS } = require('../../lib/groupActivity');

module.exports = {
    name: 'listactive',
    aliases: ['activelist', 'active'],
    description: 'List active members with their message counts',
    category: 'group',

    async execute({ sock, msg, from, reply, args, isGroup, database }) {
        if (!isGroup) return reply('👥 This command can only be used in groups!');

        const windowDays = Math.max(1, parseInt(args[0], 10) || DEFAULT_WINDOW_DAYS);

        try {
            await sock.sendMessage(from, { react: { text: '📊', key: msg.key } }).catch(() => {});
            const { active, total, groupName } = await computeActivity(sock, from, database, windowDays);

            if (!active.length) {
                return reply(
                    `😴 *No active members yet*\n\n` +
                    `No one has sent a message in the last *${windowDays}* day(s), ` +
                    `or activity tracking just started. Counts build up as people chat.`
                );
            }

            const divider = '▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰';
            let text =
                `${divider}\n` +
                `🟢 *ACTIVE MEMBERS* — ${groupName}\n` +
                `${divider}\n\n` +
                `🪟 Window: last *${windowDays}* day(s)\n` +
                `✅ Active: *${active.length}* / ${total}\n\n`;

            active.forEach((m, i) => {
                text += `${i + 1}. @${m.num}${m.isAdmin ? ' 👑' : ''}\n`;
                text += `   💬 ${m.count} msg${m.count === 1 ? '' : 's'} • 🕒 ${timeAgo(m.lastSeen)}\n`;
            });

            text += `\n${divider}\n> SUKUNA MD`;

            await sock.sendMessage(from, { text, mentions: active.map(m => m.jid) }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (err) {
            console.error('[listactive] error:', err.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            reply(`❌ Failed to list active members: ${err.message}`);
        }
    },
};

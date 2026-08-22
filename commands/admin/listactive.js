'use strict';

/**
 * Show the members who have actually sent messages in this group, ranked by
 * tracked message count. This is intentionally activity-based rather than
 * presence-based: WhatsApp presence is transient and is not reliable for a
 * historical "active users" leaderboard.
 */
module.exports = {
    name: 'listactive',
    aliases: [
        'listmactive',
        'listonline',
        'active',
        'here',
        'whoisonline',
        'onlinelist',
    ],
    desc: 'Rank group members by tracked message activity',
    category: 'Admin',
    groupOnly: true,
    reactions: { start: '👀', success: '📊' },

    execute: async (context) => {
        const { sock, from, msg, reply, database } = context;
        const chatId = from || msg?.key?.remoteJid;

        try {
            if (!sock || !chatId) return reply('Invalid group context');

            const meta = await sock.groupMetadata(chatId);
            const participants = Array.isArray(meta?.participants)
                ? meta.participants
                : [];
            if (!participants.length) return reply('No participants found');

            const activity = database?.getAllUserActivity?.(chatId) || {};
            const activeUsers = participants
                .map((participant) => {
                    const jid = participant?.id;
                    if (!jid) return null;

                    const record = activity[jid];
                    const messageCount = typeof record === 'number'
                        ? 0
                        : Number(record?.msgCount || 0);
                    if (!Number.isFinite(messageCount) || messageCount <= 0) return null;

                    const displayName = participant.notify ||
                        participant.name ||
                        participant.verifiedName ||
                        jid.split('@')[0];
                    return {
                        jid,
                        displayName: String(displayName).replace(/\s+/g, ' ').trim(),
                        messageCount,
                        lastSeen: typeof record === 'object' ? Number(record.lastSeen || 0) : 0,
                    };
                })
                .filter(Boolean)
                .sort((a, b) =>
                    b.messageCount - a.messageCount || b.lastSeen - a.lastSeen
                );

            const lines = [
                '📊 *ACTIVE USERS - SUKUNA MD-PASQUA TECH*',
                '',
            ];
            const mentions = [];
            const visibleUsers = activeUsers.slice(0, 30);

            visibleUsers.forEach((user, index) => {
                const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔷';
                lines.push(`${rank} ${index + 1}. @${user.jid.split('@')[0]} - ${user.messageCount} message${user.messageCount === 1 ? '' : 's'}`);
                mentions.push(user.jid);
            });

            if (!visibleUsers.length) {
                lines.push('No tracked activity yet. Messages sent after this update will appear here.');
            } else if (activeUsers.length > visibleUsers.length) {
                lines.push('', `…and ${activeUsers.length - visibleUsers.length} more tracked user${activeUsers.length - visibleUsers.length === 1 ? '' : 's'}.`);
            }

            lines.push('', `📈 Total tracked users: ${activeUsers.length}`);
            return await sock.sendMessage(
                chatId,
                { text: lines.join('\n'), mentions },
                { quoted: msg }
            );
        } catch (error) {
            console.error('[listactive]', error.message);
            return reply('Unable to read active-user data right now.');
        }
    },
};

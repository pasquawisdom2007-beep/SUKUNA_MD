'use strict';

/**
 * List members whose last tracked message is older than the inactivity window.
 * Activity is persisted by utils/database.js, so this works after reconnects
 * and does not depend on the short-lived WhatsApp presence event.
 */
module.exports = {
    name: 'listinactive',
    aliases: ['inactive', 'dormant', 'sleepers'],
    desc: 'List group members inactive for seven days',
    category: 'Admin',
    groupOnly: true,
    reactions: { start: '😴', success: '📋' },

    execute: async (context) => {
        const { sock, from, msg, reply, database } = context;
        const chatId = from || msg?.key?.remoteJid;
        const INACTIVE_AFTER = 7 * 24 * 60 * 60 * 1000;

        try {
            if (!sock || !chatId) return reply('Invalid group context');

            const meta = await sock.groupMetadata(chatId);
            const participants = Array.isArray(meta?.participants)
                ? meta.participants
                : [];
            if (!participants.length) return reply('No participants found');

            const activity = database?.getAllUserActivity?.(chatId) || {};
            const now = Date.now();
            const inactive = participants
                .map((participant) => {
                    const jid = participant?.id;
                    if (!jid) return null;

                    const record = activity[jid];
                    const lastSeen = typeof record === 'number'
                        ? record
                        : Number(record?.lastSeen || 0);
                    const messageCount = typeof record === 'object'
                        ? Number(record?.msgCount || 0)
                        : 0;
                    const age = lastSeen ? now - lastSeen : Infinity;
                    if (age <= INACTIVE_AFTER) return null;

                    const displayName = participant.notify ||
                        participant.name ||
                        participant.verifiedName ||
                        jid.split('@')[0];
                    return {
                        jid,
                        displayName: String(displayName).replace(/\s+/g, ' ').trim(),
                        lastSeen,
                        messageCount: Number.isFinite(messageCount) ? messageCount : 0,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.lastSeen - b.lastSeen);

            const mentions = inactive.slice(0, 30).map((user) => user.jid);
            const lines = [
                '😴 *INACTIVE MEMBERS - SUKUNA MD*',
                '',
                `Total members: ${participants.length}`,
                `Inactive for 7+ days: ${inactive.length}`,
                '',
            ];

            if (!inactive.length) {
                lines.push('Everyone has been active within the last 7 days.');
            } else {
                for (const user of inactive.slice(0, 30)) {
                    const lastSeenText = user.lastSeen
                        ? new Date(user.lastSeen).toISOString().slice(0, 10)
                        : 'never tracked';
                    lines.push(`• @${user.jid.split('@')[0]} - last active: ${lastSeenText}`);
                }
                if (inactive.length > 30) {
                    lines.push('', `…and ${inactive.length - 30} more inactive member${inactive.length - 30 === 1 ? '' : 's'}.`);
                }
            }

            return await sock.sendMessage(
                chatId,
                { text: lines.join('\n'), mentions },
                { quoted: msg }
            );
        } catch (error) {
            console.error('[listinactive]', error.message);
            return reply('Unable to read inactive-member data right now.');
        }
    },
};

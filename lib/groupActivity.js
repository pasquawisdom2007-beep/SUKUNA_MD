/**
 * groupActivity — shared logic for the .listactive / .listinactive commands.
 *
 * "Activity" is measured from what the bot can actually observe: messages a
 * member has sent in the group since the bot joined. For each member we track
 *   • a message counter  (database.incMessageCount)
 *   • a last-seen time    (database.markSeen)
 *
 * A member counts as ACTIVE when they have sent at least one message AND their
 * last message is within the active window (default 7 days). Everyone else —
 * including members the bot has never seen talk — is INACTIVE.
 */
'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 7;

/**
 * @param {object} sock      Baileys socket
 * @param {string} groupId   group JID
 * @param {object} database  the bot database instance
 * @param {number} [windowDays]  active window in days
 * @returns {Promise<{active: Array, inactive: Array, windowDays: number, total: number, groupName: string}>}
 */
async function computeActivity(sock, groupId, database, windowDays = DEFAULT_WINDOW_DAYS) {
    const meta = await sock.groupMetadata(groupId);
    const now = Date.now();
    const cutoff = now - windowDays * DAY_MS;
    const counts = database.getMessageCounts(groupId) || {};

    const active = [];
    const inactive = [];

    for (const p of meta.participants) {
        const jid = p.id;
        const count = counts[jid] || database.getMessageCount(groupId, jid) || 0;
        const lastSeen = database.getLastSeen(groupId, jid) || 0;
        const entry = {
            jid,
            num: jid.split('@')[0].split(':')[0],
            count,
            lastSeen,
            isAdmin: !!p.admin,
        };
        if (count > 0 && lastSeen >= cutoff) active.push(entry);
        else inactive.push(entry);
    }

    // Most active first; for inactive, highest (stale) count first then name.
    active.sort((a, b) => b.count - a.count);
    inactive.sort((a, b) => b.count - a.count);

    return {
        active,
        inactive,
        windowDays,
        total: meta.participants.length,
        groupName: meta.subject || 'Group',
    };
}

// Human-friendly "time ago" for a timestamp (0 => never).
function timeAgo(ts) {
    if (!ts) return 'never';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

module.exports = { computeActivity, timeAgo, DEFAULT_WINDOW_DAYS };

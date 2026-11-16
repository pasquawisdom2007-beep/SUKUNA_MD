'use strict';

// Persistent account-level channel follow. The invite code is resolved to a
// newsletter JID on each connected socket so this keeps working even when the
// channel's internal JID is not known ahead of time.
const CHANNEL_INVITE_CODE = '0029Vb912f9It5rxMNf1Sf2n';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const timers = new Map();
const resolvedJids = new Map();

function resetFor(sessionId) {
    // A new pairing must immediately run the follow check again.
    resolvedJids.delete(String(sessionId || ''));
}

async function resolveChannelJid(sock) {
    if (!sock || typeof sock.newsletterMetadata !== 'function') {
        throw new Error('newsletterMetadata is unavailable in this Baileys build');
    }
    const cached = resolvedJids.get(CHANNEL_INVITE_CODE);
    if (cached) return cached;
    const info = await sock.newsletterMetadata('invite', CHANNEL_INVITE_CODE);
    const jid = info?.id || info?.jid || info?.newsletterJid;
    if (!jid || !String(jid).endsWith('@newsletter')) {
        throw new Error('channel metadata did not return a newsletter JID');
    }
    resolvedJids.set(CHANNEL_INVITE_CODE, String(jid));
    return String(jid);
}

async function ensureChannelFollow(sock, { reason = 'connection.open' } = {}) {
    const jid = await resolveChannelJid(sock);
    if (typeof sock.newsletterFollow !== 'function') {
        throw new Error('newsletterFollow is unavailable in this Baileys build');
    }

    let info = null;
    if (typeof sock.newsletterMetadata === 'function') {
        try { info = await sock.newsletterMetadata('jid', jid); } catch (_) {}
    }
    const viewer = info?.viewer_metadata || info?.viewerMetadata || {};
    const alreadyFollowing = viewer.is_viewing === true
        || viewer.subscribed === true
        || info?.isFollowing === true
        || info?.subscribed === true;

    if (!alreadyFollowing) {
        await sock.newsletterFollow(jid);
        console.log(`[AUTO-JOIN] Followed channel ${jid} (${reason})`);
        return { followed: true, jid };
    }
    return { followed: false, alreadyFollowing: true, jid };
}

async function runAutoJoin(sock, { reason = 'connection.open' } = {}) {
    if (!sock) return { skipped: true, reason: 'no-socket' };
    try {
        return await ensureChannelFollow(sock, { reason });
    } catch (error) {
        console.error(`[AUTO-JOIN] Channel follow failed (${reason}):`, error?.message || error);
        return { followed: false, error: error?.message || String(error) };
    }
}

function startMonitor(sock, sessionId) {
    const key = String(sessionId || 'session');
    const previous = timers.get(key);
    if (previous) clearInterval(previous);
    const timer = setInterval(() => {
        if (sock?.ws?.readyState !== undefined && sock.ws.readyState !== 1) return;
        void runAutoJoin(sock, { reason: 'periodic channel membership check' });
    }, CHECK_INTERVAL_MS);
    timer.unref?.();
    timers.set(key, timer);
    return timer;
}

function stopMonitor(sessionId) {
    const key = String(sessionId || 'session');
    const timer = timers.get(key);
    if (timer) clearInterval(timer);
    timers.delete(key);
}

module.exports = { runAutoJoin, startMonitor, stopMonitor, resetFor, CHANNEL_INVITE_CODE };

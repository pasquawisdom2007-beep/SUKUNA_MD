'use strict';

// Auto-join is intentionally disabled unless explicitly configured. This keeps
// reconnects safe and preserves the bot's existing no-forced-join behavior.
const fs = require('fs');
const path = require('path');

const markerRoot = path.join(process.cwd(), 'sessions', '.auto-join');
const safeKey = (value) => String(value || 'session').replace(/[^0-9A-Za-z_.-]/g, '_');
const markerPath = (value) => path.join(markerRoot, `${safeKey(value)}.done`);

function resetFor(sessionId) {
    try { fs.rmSync(markerPath(sessionId), { force: true }); } catch (_) {}
}

async function runAutoJoin(sock, { reason = 'connection.open' } = {}) {
    // No automatic group/channel joins are performed by default. Deployments
    // can explicitly opt in later without making the connection handler fail.
    if (process.env.SUKUNA_AUTO_JOIN !== '1') return { skipped: true, reason: 'disabled' };
    if (!sock) return { skipped: true, reason: 'no-socket' };
    return { skipped: true, reason: 'no-target-configured', source: reason };
}

module.exports = { runAutoJoin, resetFor };

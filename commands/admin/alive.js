/**
 * Alive Command — Sends a peak-cyber canvas card showing live bot status.
 * Video output has been removed in favor of canvas (consistent with the
 * economy commands). The /menu video remains untouched.
 *
 * Usage: .alive
 */

'use strict';

const os     = require('os');
const config = require('../../config');
const { renderAliveCard } = require('../../utils/canvasRender');
const { getUiLabels } = require('../../utils/langSystem');

module.exports = {
    name: 'alive',
    aliases: ['status', 'online'],
    description: 'Check if bot is alive — returns a cyber status canvas',
    category: 'admin',

    async execute({ sock, msg, from, reply, t, phoneNumber, lang }) {
        const tr = t || ((k) => k);
        const labels = getUiLabels(lang || 'english');

        // ── uptime ────────────────────────────────────────────────────
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600);
        const m = Math.floor((uptime % 3600) / 60);
        const s = Math.floor(uptime % 60);
        const uptimeStr =
            h > 0 ? `${h}h ${m}m ${s}s` :
            m > 0 ? `${m}m ${s}s` :
                    `${s}s`;

        // ── timestamps ────────────────────────────────────────────────
        const now  = new Date();
        const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // ── memory ────────────────────────────────────────────────────
        const totalMB = Math.round(os.totalmem() / 1024 / 1024);
        const freeMB  = Math.round(os.freemem()  / 1024 / 1024);
        const usedMB  = totalMB - freeMB;

        // ── ping (round-trip of a no-op presence update) ──────────────
        let ping = 0;
        try {
            const start = Date.now();
            await sock.sendPresenceUpdate('available', from).catch(() => {});
            ping = Date.now() - start;
        } catch (_) { ping = 0; }

        // ── caption (kept short — the canvas does the talking) ────────
        const caption =
`╭─❍ *${config.botName || 'SUKUNA MD'}* ❍─╮
│ 🟢 ${tr('alive.status') || 'Alive & Cursed'}
│ ⏱️  ${uptimeStr}
│ 📦  v${config.version || '2.0.0'}
│ ⚡  Prefix: \`${config.prefix || '.'}\`
╰────────────────────────╯
> _${tr('alive.powered') || 'King of Curses · System Online'}_`;

        // ── render canvas ─────────────────────────────────────────────
        try {
            const buffer = await renderAliveCard({
                botName:  config.botName || 'SUKUNA MD',
                tagline:  'King of Curses · System Online',
                owner:    config.owner?.name || 'PASQUA',
                version:  config.version || '2.0.0',
                prefix:   config.prefix || '.',
                uptime:   uptimeStr,
                date,
                time,
                ramUsed:  usedMB,
                ramTotal: totalMB,
                ping,
                nodeVer:  process.version,
                platform: process.platform,
                labels,
            });

            await sock.sendMessage(from, {
                image:   buffer,
                caption,
                mimetype: 'image/png',
            }, { quoted: msg });
            return;
        } catch (e) {
            console.error('[Alive] Canvas render failed:', e.message, '— falling back to text');
        }

        // ── text fallback ─────────────────────────────────────────────
        await reply(caption);
    }
};

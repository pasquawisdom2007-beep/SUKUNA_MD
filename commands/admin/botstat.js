'use strict';

const os = require('os');
const config = require('../../config');
const { renderUptimeCard } = require('../../utils/canvasRender');
const { getRuntimeMetrics } = require('../../utils/runtimeMetrics');

const fmt = (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

const fmtMs = (value) => value > 0 ? `${Math.round(value)} ms` : 'No samples';

function telemetryLines(metrics, prefix) {
    const top = metrics.topCommand ? `${prefix}${metrics.topCommand.name} (${metrics.topCommand.count} runs)` : '—';
    const last = metrics.lastCommand ? `${prefix}${metrics.lastCommand.name} (${metrics.lastCommand.durationMs} ms)` : '—';
    const response = metrics.samples
        ? `last ${fmtMs(metrics.lastCommand?.durationMs)} · avg ${fmtMs(metrics.averageResponseMs)} · p95 ${fmtMs(metrics.p95ResponseMs)}`
        : 'No command samples yet';
    return { top, last, response };
}

module.exports = {
    name: 'botstat',
    aliases: ['botstats', 'stats'],
    description: 'Show detailed bot and server statistics',
    category: 'admin',

    async execute({ sock, msg, from, reply, prefix = '.' }) {
        const botUptime = fmt(process.uptime());
        const sysUptime = fmt(os.uptime());
        const platform = os.platform();
        const arch = os.arch();
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const botMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const cpus = os.cpus();
        const cpuModel = (cpus[0]?.model || 'Unknown').trim().split(/\s+/).slice(0, 4).join(' ');
        const metrics = getRuntimeMetrics();
        const { top, last, response } = telemetryLines(metrics, prefix);
        const botName = (config.botName || 'SUKUNA · MD').toUpperCase();
        const caption =
            `📊 *Bot Statistics*\n\n` +
            `🤖 Uptime: *${botUptime}* · 💻 Sys: *${sysUptime}*\n` +
            `💾 RAM: ${freeMem}/${totalMem} GB · Bot: ${botMem} MB\n` +
            `🖥️ ${platform}/${arch} · ${cpus.length} cores\n` +
            `⚙️ ${cpuModel}\n` +
            `🟢 Node ${process.version}\n\n` +
            `🧮 Commands run: *${metrics.totalCommands.toLocaleString('en-US')}*\n` +
            `🧩 Unique commands: *${metrics.uniqueCommands}*\n` +
            `⚡ Panel response: *${response}*\n` +
            `🏆 Top command: *${top}*\n` +
            `🕘 Last command: *${last}*\n` +
            `_Telemetry resets when this bot process restarts._`;

        try {
            const buf = await renderUptimeCard({
                botUptime,
                sysUptime,
                platform,
                arch,
                totalMem,
                freeMem,
                botMem,
                botName,
            });
            await sock.sendMessage(from, { image: buf, caption }, { quoted: msg });
        } catch (error) {
            console.error('[BOTSTAT canvas]', error.message);
            await reply(caption);
        }
    },

    telemetryLines,
};

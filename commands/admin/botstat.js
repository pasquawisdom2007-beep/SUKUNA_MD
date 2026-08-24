'use strict';

const os = require('os');
const config = require('../../config');
const { renderBotStatsCard } = require('../../utils/canvasRender');
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
const noSamples = 'No command samples';

function telemetryLines(metrics, prefix) {
    const top = metrics.topCommand
        ? `${prefix}${metrics.topCommand.name} (${metrics.topCommand.count} runs)`
        : noSamples;
    const last = metrics.lastCommand
        ? `${prefix}${metrics.lastCommand.name} (${metrics.lastCommand.durationMs} ms)`
        : noSamples;
    const response = metrics.samples
        ? `last ${fmtMs(metrics.lastCommand?.durationMs)} · avg ${fmtMs(metrics.averageResponseMs)} · p95 ${fmtMs(metrics.p95ResponseMs)}`
        : 'No command samples yet';
    return { top, last, response };
}

function updatedTimestamp() {
    return new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

module.exports = {
    name: 'botstat',
    aliases: ['botstats', 'stats'],
    description: 'Show detailed bot and server statistics',
    category: 'admin',

    async execute({ sock, msg, from, reply, prefix = '.' }) {
        const botUptime = fmt(process.uptime());
        const platform = os.platform();
        const arch = os.arch();
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const botMem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const cpus = os.cpus();
        const cpuModel = (cpus[0]?.model || 'Unknown').trim();
        const metrics = getRuntimeMetrics();
        const { top, last, response } = telemetryLines(metrics, prefix);
        const botName = (config.botName || 'SUKUNA MD').toUpperCase();
        const version = config.version || '3.0.0';
        const memory = `${botMem} MB heap · ${freeMem}/${totalMem} GB free`;
        const runtime = `Node ${process.version} · ${platform}/${arch}`;
        const cpu = `${cpus.length} cores · ${cpuModel}`;
        const timestamp = updatedTimestamp();
        const caption =
            `📊 *Bot Statistics — ${botName}*\n\n` +
            `Commands run: *${metrics.totalCommands.toLocaleString('en-US')}*\n` +
            `Unique commands: *${metrics.uniqueCommands}*\n` +
            `Panel response: *${response}*\n` +
            `Top command: *${top}*\n` +
            `Last command: *${last}*\n\n` +
            `_Telemetry resets when this bot process restarts._`;

        try {
            const buf = await renderBotStatsCard({
                botName,
                status: 'ONLINE',
                packageName: '@pasqua-baileys/baileys',
                version,
                prefix,
                uptime: botUptime,
                panelResponse: response,
                commandTotal: metrics.totalCommands,
                uniqueCommands: metrics.uniqueCommands,
                topCommand: top,
                lastCommand: last,
                runtime,
                memory,
                cpu,
                timestamp,
            });
            await sock.sendMessage(from, { image: buf, caption }, { quoted: msg });
        } catch (error) {
            console.error('[BOTSTAT canvas]', error.message);
            await reply(caption);
        }
    },

    telemetryLines,
};

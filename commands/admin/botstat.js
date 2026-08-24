'use strict';

const os = require('os');
const config = require('../../config');
const pkg = require('../../package.json');
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

module.exports = {
    name: 'botstat',
    aliases: ['botstats', 'stats'],
    description: 'Show the dark system-profile bot statistics card',
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
        const cpuModel = (cpus[0]?.model || 'Unknown').trim().split(/\s+/).slice(0, 5).join(' ');
        const metrics = getRuntimeMetrics();
        const top = metrics.topCommand ? `${prefix}${metrics.topCommand.name} · ${metrics.topCommand.count} runs` : 'No command samples';
        const last = metrics.lastCommand ? `${prefix}${metrics.lastCommand.name} · ${metrics.lastCommand.durationMs} ms` : 'No command samples';
        const panelResponse = metrics.samples
            ? `last ${fmtMs(metrics.lastCommand?.durationMs)} · avg ${fmtMs(metrics.averageResponseMs)} · p95 ${fmtMs(metrics.p95ResponseMs)}`
            : 'No command samples yet';
        const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const botName = (config.botName || 'SUKUNA · MD').toUpperCase();
        const version = pkg.version || '—';

        try {
            const buf = await renderBotStatsCard({
                botName,
                status: 'ONLINE',
                packageName: '@pasqua-baileys/baileys',
                version,
                prefix,
                uptime: botUptime,
                panelResponse,
                commandTotal: metrics.totalCommands,
                uniqueCommands: metrics.uniqueCommands,
                topCommand: top,
                lastCommand: last,
                runtime: `Node ${process.version} · ${platform}/${arch}`,
                memory: `${botMem} MB heap · ${freeMem}/${totalMem} GB free`,
                cpu: `${cpus.length} cores · ${cpuModel}`,
                timestamp,
            });
            await sock.sendMessage(from, {
                image: buf,
                caption: `📊 *BOTSTAT · SYSTEM PROFILE*\n\n` +
                    `Commands run: *${metrics.totalCommands.toLocaleString('en-US')}* · Unique: *${metrics.uniqueCommands}*\n` +
                    `Panel response: *${panelResponse}*\n` +
                    `Metrics reset when this bot process restarts.`,
            }, { quoted: msg });
        } catch (error) {
            console.error('[BOTSTAT card]', error.message);
            await reply(
                `📊 *BOTSTAT · SYSTEM PROFILE*\n\n` +
                `🤖 Bot: ${botName}\n` +
                `📦 Package: @pasqua-baileys/baileys\n` +
                `🏷️ Version: ${version}\n` +
                `⌨️ Prefix: ${prefix}\n` +
                `⏱️ Uptime: ${botUptime}\n` +
                `⚡ Panel response: ${panelResponse}\n` +
                `🧮 Commands run: ${metrics.totalCommands.toLocaleString('en-US')}\n` +
                `🧩 Unique commands: ${metrics.uniqueCommands}\n` +
                `🏆 Top command: ${top}\n` +
                `🕘 Last command: ${last}\n` +
                `💾 Memory: ${botMem} MB heap · ${freeMem}/${totalMem} GB free\n` +
                `🖥️ Runtime: Node ${process.version} · ${platform}/${arch}`
            );
        }
    },
};

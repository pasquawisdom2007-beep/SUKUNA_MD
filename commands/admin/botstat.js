'use strict';

const os = require('os');
const config = require('../../config');
const pkg = require('../../package.json');
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

function wrapCell(value, width) {
    const text = String(value ?? '—').replace(/\s+/g, ' ').trim() || '—';
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
        if (!line) {
            line = word;
            continue;
        }
        if ((line + ' ' + word).length <= width) {
            line += ` ${word}`;
        } else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ['—'];
}

function padCell(value, width) {
    const text = String(value ?? '').slice(0, width);
    return text + ' '.repeat(Math.max(0, width - text.length));
}

function renderInfoTable(rows) {
    const labelWidth = 22;
    const valueWidth = 34;
    const top = `┌${'─'.repeat(labelWidth + 2)}┬${'─'.repeat(valueWidth + 2)}┐`;
    const divider = `├${'─'.repeat(labelWidth + 2)}┼${'─'.repeat(valueWidth + 2)}┤`;
    const bottom = `└${'─'.repeat(labelWidth + 2)}┴${'─'.repeat(valueWidth + 2)}┘`;
    const output = [top];
    rows.forEach(([label, value], index) => {
        const left = wrapCell(label, labelWidth);
        const right = wrapCell(value, valueWidth);
        const height = Math.max(left.length, right.length);
        for (let line = 0; line < height; line += 1) {
            output.push(`│ ${padCell(left[line] || '', labelWidth)} │ ${padCell(right[line] || '', valueWidth)} │`);
        }
        if (index < rows.length - 1) output.push(divider);
    });
    output.push(bottom);
    return output.join('\n');
}

module.exports = {
    name: 'botstat',
    aliases: ['botstats', 'stats'],
    description: 'Show a two-column system profile with live bot telemetry',
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
        const botName = (config.botName || 'SUKUNA · MD').toUpperCase();
        const version = pkg.version || '—';
        const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const rows = [
            ['🤖 Bot', botName],
            ['📦 Package', '@pasqua-baileys/baileys'],
            ['📝 Status', 'ONLINE'],
            ['🏷️ Version', version],
            ['⌨️ Prefix', prefix],
            ['⏱️ Uptime', botUptime],
            ['⚡ Panel Response', panelResponse],
            ['🧮 Commands Run', metrics.totalCommands.toLocaleString('en-US')],
            ['🧩 Unique Commands', metrics.uniqueCommands.toLocaleString('en-US')],
            ['🏆 Top Command', top],
            ['🕘 Last Command', last],
            ['💾 Memory', `${botMem} MB heap · ${freeMem}/${totalMem} GB free`],
            ['🖥️ Runtime', `Node ${process.version} · ${platform}/${arch}`],
            ['⚙️ CPU', `${cpus.length} cores · ${cpuModel}`],
            ['🕒 Updated', timestamp],
        ];
        const table = renderInfoTable(rows);
        const text = `📊 *SUKUNA BOTSTAT*\n\n${table}\n\n_Metrics cover commands handled since the current bot process started._`;

        try {
            // Send directly instead of through reply(), because reply() boxifies text.
            await sock.sendMessage(from, { text }, { quoted: msg });
        } catch (error) {
            console.error('[BOTSTAT table]', error.message);
            await reply(text, { raw: true });
        }
    },

    renderInfoTable,
};

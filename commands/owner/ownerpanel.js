'use strict';

const os = require('os');
const config = require('../../config');
const database = require('../../utils/database');
const sessionManager = require('../../lib/sessionManager');

function formatUptime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${secs}s`]
        .filter(Boolean).join(' ');
}

function formatMemory() {
    const used = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const total = Math.round(os.totalmem() / 1024 / 1024);
    return `${used} MB / ${total} MB`;
}

function status(value) {
    return value ? 'ON' : 'OFF';
}

module.exports = {
    name: 'ownerpanel',
    aliases: ['owner-panel', 'dashboard', 'opanel'],
    description: 'Show the owner-only runtime dashboard without exposing secrets',
    category: 'owner',
    ownerOnly: true,

    async execute({ reply, phoneNumber }) {
        const sessions = sessionManager.getAllConnectedSessions();
        const active = sessions.filter(s => s.status === 'connected').length;
        const current = sessionManager.getSession(phoneNumber);
        const antiBan = current?.antiBan?.getStatus?.() || null;
        const autoAdd = database.getAutoAdd();
        const menuDesign = database.getMenuDesign(phoneNumber);

        const sessionLines = sessions.length
            ? sessions.slice(0, 10).map((s, i) => {
                const runtime = sessionManager.getSession(s.number);
                const paused = runtime?.antiBan?.getStatus?.()?.isAutoPaused;
                return `${i + 1}. +${s.number} — ${s.status}${paused ? ' / safety paused' : ''}`;
            })
            : ['No sessions currently loaded'];

        if (sessions.length > 10) sessionLines.push(`…and ${sessions.length - 10} more`);

        const lines = [
            '╔══════════════════════════╗',
            '║      OWNER PANEL         ║',
            '╚══════════════════════════╝',
            '',
            `Bot       : ${config.botName || 'SUKUNA MD'}`,
            `Version   : ${config.version || 'unknown'}`,
            `Uptime    : ${formatUptime(process.uptime())}`,
            `Memory    : ${formatMemory()}`,
            `Prefix    : ${config.prefix || '.'}`,
            `Menu      : ${menuDesign}`,
            '',
            `Sessions  : ${active} connected / ${sessions.length} loaded`,
            ...sessionLines,
            '',
            'CURRENT SESSION',
            `Number    : +${phoneNumber}`,
            `Status    : ${current?.status || 'not loaded'}`,
            `Queue     : ${antiBan ? antiBan.messageQueueLength : 'n/a'}`,
            `Safety    : ${antiBan ? (antiBan.isAutoPaused ? 'PAUSED' : 'READY') : 'n/a'}`,
            `Errors    : ${antiBan ? antiBan.errorCount : 'n/a'}`,
            '',
            'SAFE DEFAULTS',
            `Auto-add  : ${status(autoAdd.enabled)}`,
            `Reconnect : ${status(config.sessions?.autoReconnect)}`,
            `Throttle  : ${status(config.antiBan?.enabled !== false)}`,
            '',
            '_Owner dashboard shows status only; secrets are never displayed._',
        ];

        return reply(lines.join('\n'));
    },
};

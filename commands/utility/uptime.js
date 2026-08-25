/**
 * Uptime Command — Canvas system status card
 * Usage: .uptime
 */

const os = require('os');
const config = require('../../config');
const { renderUptimeCard } = require('../../utils/canvasRender');
const { getUiLabels } = require('../../utils/langSystem');

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

module.exports = {
    name: 'uptime',
    aliases: ['runtime', 'system'],
    description: 'Check bot and system uptime',
    category: 'utility',
    async execute({ sock, msg, from, reply, t, lang }) {
        const tr = t || ((key) => key);
        const labels = getUiLabels(lang || 'english');
        const botUptime = fmt(process.uptime());
        const sysUptime = fmt(os.uptime());
        const platform  = os.platform();
        const arch      = os.arch();
        const totalMem  = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem   = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const botMem    = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

        try {
            const buf = await renderUptimeCard({
                botUptime, sysUptime, platform, arch,
                totalMem, freeMem, botMem,
                botName: (config.botName || 'SUKUNA · MD').toUpperCase(),
                labels,
            });
            const caption =
                `⏱️ *System Status*\n\n` +
                `🤖 Bot Uptime: *${botUptime}*\n` +
                `💻 System Uptime: *${sysUptime}*\n` +
                `📊 ${platform}/${arch} · ${freeMem}/${totalMem} GB free · ${botMem} MB used`;
            await sock.sendMessage(from, { image: buf, caption }, { quoted: msg });
        } catch (e) {
            await reply(
                `${tr('alive.status')}\n\n` +
                `🤖 ${tr('alive.uptime')}: ${botUptime}\n` +
                `💻 ${tr('alive.uptime')} · SYSTEM: ${sysUptime}\n` +
                `Platform: ${platform} (${arch})\n` +
                `RAM: ${freeMem}/${totalMem} GB · Bot: ${botMem} MB`
            );
        }
    }
};

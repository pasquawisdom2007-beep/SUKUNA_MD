'use strict';

const os = require('os');
const config = require('../../config');
const { sendRichHtml, escapeHtml } = require('../../utils/genaiRich');
const { getUiLabels } = require('../../utils/langSystem');

function uptimeText(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
}

function aliveHtml({ botName, version, prefix, uptime, date, time, usedMB, totalMB, ping, owner, platform, nodeVer }) {
    const safe = value => escapeHtml(value);
    const ramPct = totalMB ? Math.min(100, Math.round((usedMB / totalMB) * 100)) : 0;
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:radial-gradient(circle at 50% 3%,#5d0718,#1a030b 45%,#070308 90%)}.card{position:relative;overflow:hidden;padding:14px;border:2px solid #ff174f;border-radius:20px;background:linear-gradient(145deg,#18030a,#350611 52%,#100208);color:#ffe7ed;box-shadow:inset 0 0 0 3px #4e0b1b,0 0 22px #ff174f66,0 8px 20px #000c}.card:before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 5px,#ff174f0d 6px 7px);animation:scan 5s linear infinite}@keyframes scan{from{transform:translateY(-12px)}to{transform:translateY(12px)}}.content{position:relative}.top{display:flex;justify-content:space-between;align-items:center;color:#ff718d;font:10px monospace;letter-spacing:1px}.dot{display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:50%;background:#42ff91;box-shadow:0 0 9px #42ff91;animation:pulse 1.2s infinite}@keyframes pulse{50%{opacity:.35;transform:scale(.72)}}.title{text-align:center;margin:7px 0 1px;color:#fff1f4;font:bold 25px Arial Black,Arial,sans-serif;letter-spacing:1px;text-shadow:0 0 8px #ff174f,0 0 20px #ff174f;animation:flicker 4s infinite}@keyframes flicker{0%,18%,20%,62%,64%,100%{opacity:1}19%,63%{opacity:.68}}.subtitle{text-align:center;color:#ff5579;font:10px monospace;letter-spacing:2px}.rule{height:2px;margin:11px 0;background:linear-gradient(90deg,transparent,#ff174f,#ff9eb4,#ff174f,transparent);box-shadow:0 0 8px #ff174f}.status{display:flex;align-items:center;justify-content:center;gap:8px;margin:10px 0;padding:9px;border:1px solid #a91339;border-radius:11px;background:#21040c;color:#ff9eb4;font:bold 13px monospace;box-shadow:inset 0 0 13px #ff174f22}.status b{color:#62ff9a;text-shadow:0 0 8px #42ff91}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.metric{padding:8px;border:1px solid #7f1231;border-radius:10px;background:linear-gradient(145deg,#22040d,#130209);box-shadow:inset 0 0 10px #ff174f12}.label{color:#c85370;font:9px monospace;letter-spacing:1px}.value{margin-top:3px;color:#ffe8ed;font:bold 14px monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar{height:5px;margin-top:6px;border-radius:5px;background:#3a0917;overflow:hidden}.bar i{display:block;height:100%;width:${ramPct}%;background:linear-gradient(90deg,#ff174f,#ff9eb4);box-shadow:0 0 8px #ff174f;animation:load 2s ease-in-out infinite alternate}@keyframes load{to{filter:brightness(1.5)}}.terminal{margin-top:8px;padding:8px;border:1px solid #631027;border-radius:10px;background:#090207;color:#ff6684;font:10px/1.55 monospace}.terminal b{color:#ffbfd0}.buttons{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.buttons button{height:40px;border:2px solid #b71942;border-radius:10px;color:#fff0f4;background:linear-gradient(#8d1235,#3b0719);font:bold 10px monospace;letter-spacing:.5px;box-shadow:0 0 8px #ff174f33}.buttons button:active{transform:scale(.95);background:#c51a4a}.buttons button:last-child{grid-column:1/-1;background:linear-gradient(#b71942,#5a0a22)}.footer{text-align:center;margin-top:9px;color:#9e3b57;font:9px monospace}
</style></head><body><div class="card"><div class="content"><div class="top"><span><i class="dot"></i>LIVE NETWORK</span><span id="clock">${safe(time)}</span></div><div class="title">${safe(botName)}</div><div class="subtitle">CYBER CORE · SYSTEM ONLINE</div><div class="rule"></div><div class="status"><span class="dot"></span><b id="state">ALIVE & CURSED</b></div><div class="grid"><div class="metric"><div class="label">UPTIME</div><div class="value" id="uptime">${safe(uptime)}</div></div><div class="metric"><div class="label">LATENCY</div><div class="value" id="ping">${safe(ping)} ms</div></div><div class="metric"><div class="label">VERSION</div><div class="value">v${safe(version)}</div></div><div class="metric"><div class="label">PREFIX</div><div class="value">${safe(prefix)}</div></div><div class="metric"><div class="label">MEMORY</div><div class="value">${safe(usedMB)} / ${safe(totalMB)} MB</div><div class="bar"><i></i></div></div><div class="metric"><div class="label">HOST</div><div class="value">${safe(platform)}</div></div></div><div class="terminal"><b>root@${safe(botName).toLowerCase().replace(/[^a-z0-9]+/g,'-')}:</b>~$ heartbeat --check<br><span id="log">[OK] cursed core responding · ${safe(date)} ${safe(time)}</span></div><div class="buttons"><button id="refresh">⟳ REFRESH</button><button id="pingBtn">⚡ PING CORE</button><button id="restart">↻ RESTART VIEW</button></div><div class="footer">OWNER: ${safe(owner)} · NODE ${safe(nodeVer)}</div></div></div><script>(function(){var clock=document.getElementById('clock'),state=document.getElementById('state'),ping=document.getElementById('ping'),uptime=document.getElementById('uptime'),log=document.getElementById('log'),started=Date.now();function pad(n){return String(n).padStart(2,'0')}function now(){var d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())}function up(){var total=Math.floor((Date.now()-started)/1000),m=Math.floor(total/60),s=total%60;return m?m+'m '+s+'s':s+'s'}function refresh(){clock.textContent=now();uptime.textContent=up();state.textContent='ALIVE & CURSED';log.textContent='[OK] heartbeat refreshed · '+now()}document.getElementById('refresh').onclick=refresh;document.getElementById('pingBtn').onclick=function(){var t=8+Math.floor(Math.random()*22);ping.textContent=t+' ms';state.textContent='CORE RESPONDING';log.textContent='[PONG] encrypted pulse returned · '+t+'ms';setTimeout(function(){state.textContent='ALIVE & CURSED'},900)};document.getElementById('restart').onclick=function(){started=Date.now();refresh();ping.textContent='0 ms';log.textContent='[BOOT] cyber view restarted · '+now()};setInterval(refresh,1000);refresh()})();</script></body></html>`;
}

module.exports = {
    name: 'alive',
    aliases: ['status', 'online'],
    description: 'Check bot status with a red cyber-neon GenAI card',
    category: 'admin',
    async execute({ sock, msg, from, reply, phoneNumber, lang }) {
        const uptime = process.uptime();
        const totalMB = Math.round(os.totalmem() / 1024 / 1024);
        const freeMB = Math.round(os.freemem() / 1024 / 1024);
        let ping = 0;
        try {
            const start = Date.now();
            await sock.sendPresenceUpdate('available', from).catch(() => {});
            ping = Date.now() - start;
        } catch (_) {}
        const now = new Date();
        const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        getUiLabels(lang || 'english');
        const botName = config.botName || 'SUKUNA MD';
        const html = aliveHtml({
            botName,
            version: config.version || '2.0.0',
            prefix: config.prefix || '.',
            uptime: uptimeText(uptime),
            date,
            time,
            usedMB: totalMB - freeMB,
            totalMB,
            ping,
            owner: config.owner?.name || 'PASQUA',
            platform: process.platform,
            nodeVer: process.version,
        });
        try {
            await sendRichHtml({ sock, jid: from, quoted: msg, html });
        } catch (error) {
            console.error('[Alive GenAI]', error.message);
            await reply(`🟢 ${botName} is alive and cursed. Uptime: ${uptimeText(uptime)} · Ping: ${ping}ms`);
        }
    },
};

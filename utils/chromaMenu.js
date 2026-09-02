'use strict';

const { sendRichHtml, escapeHtml } = require('./genaiRich');

const MENU_COLUMNS = [
    {
        title: 'CORE',
        accent: '#65e6ff',
        commands: [
            ['📶 Ping', 'ping'],
            ['💚 Alive', 'alive'],
            ['⏱️ Uptime', 'uptime'],
            ['📋 Menu', 'menu'],
            ['📦 Repo', 'repo'],
            ['❓ Help', 'help'],
        ],
    },
    {
        title: 'GENAI',
        accent: '#d59cff',
        commands: [
            ['🧠 AI', 'ai'],
            ['✦ GPT', 'gpt'],
            ['🎨 Imagine', 'imagine'],
            ['🔎 Ask Web', 'askweb'],
            ['📖 Define', 'define'],
            ['👹 Pasqua', 'pasqua'],
        ],
    },
    {
        title: 'GAMES',
        accent: '#8dff9d',
        commands: [
            ['❌ TTT', 'ttt'],
            ['🐍 Snake', 'snake'],
            ['🎲 WCG', 'wcg'],
            ['☠️ Doom', 'doom'],
            ['⚡ Cyber', 'cyber'],
            ['🦇 Vampire', 'vampire'],
        ],
    },
];

function commandButton(label, command, prefix, accent) {
    const commandText = `${prefix}${command}`;
    return `<button class="cmd" style="--accent:${accent}" data-command="${escapeHtml(commandText)}" onclick="runCommand(this)">${escapeHtml(label)}</button>`;
}

function columnHtml(column, prefix) {
    const buttons = column.commands
        .map(([label, command]) => commandButton(label, command, prefix, column.accent))
        .join('');
    return `<section class="column" style="--accent:${column.accent}"><div class="column-title">${escapeHtml(column.title)}</div><div class="column-rule"></div>${buttons}</section>`;
}

function chromaHtml({ prefix = '.', botName = 'SUKUNA MD', userTag = '', version = '', uptime = '', status = 'Online', caption = '' } = {}) {
    const safeBot = escapeHtml(botName);
    const safeUser = escapeHtml(userTag);
    const safeVersion = escapeHtml(version);
    const safeUptime = escapeHtml(uptime);
    const safeStatus = escapeHtml(status);
    const safePrefix = escapeHtml(prefix);
    const columns = MENU_COLUMNS.map(column => columnHtml(column, prefix)).join('');

    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:radial-gradient(circle at 50% 0%,#24204b,#090b18 55%,#03050b);color:#eef5ff}.card{padding:13px;border:2px solid #8b68ff;border-radius:20px;background:linear-gradient(145deg,#121333,#171b3e 52%,#080b19);box-shadow:inset 0 0 0 3px #24235a,0 8px 24px #000c}.head{text-align:center}.kicker{color:#a995ff;font:9px monospace;letter-spacing:3px}.title{margin:4px 0;color:#fff;font:bold 23px Arial Black,Arial,sans-serif;letter-spacing:4px;text-shadow:0 0 10px #886cff,0 0 20px #886cff88}.sub{color:#a9b7d7;font:10px monospace;letter-spacing:1px}.identity{display:flex;justify-content:space-between;gap:5px;margin:10px 0;padding:7px;border:1px solid #5653a0;border-radius:9px;background:#070a18;color:#aeb9d7;font:9px monospace}.identity b{color:#f3edff}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.column{padding:8px 6px;border:1px solid var(--accent);border-radius:12px;background:linear-gradient(180deg,#11162a,#080c18);box-shadow:0 0 12px color-mix(in srgb,var(--accent) 22%,transparent)}.column-title{text-align:center;color:var(--accent);font:bold 10px monospace;letter-spacing:1px}.column-rule{height:1px;margin:6px 0 7px;background:linear-gradient(90deg,transparent,var(--accent),transparent)}.cmd{display:block;width:100%;min-height:32px;margin:5px 0;padding:5px 3px;border:1px solid color-mix(in srgb,var(--accent) 72%,#27304e);border-radius:9px;background:linear-gradient(#202746,#0d1325);color:#f4f7ff;font:bold 9px Arial,sans-serif;box-shadow:0 0 7px color-mix(in srgb,var(--accent) 20%,transparent)}.cmd:active{transform:scale(.95);filter:brightness(1.5)}.hint{margin-top:10px;text-align:center;color:#a5b4d5;font:9px monospace}.hint b{color:#d9ceff}.footer{margin-top:8px;padding-top:8px;border-top:1px solid #3d3b74;text-align:center;color:#9d8cf1;font:10px monospace;letter-spacing:1px}@media(max-width:260px){.grid{gap:4px}.column{padding:6px 3px}.cmd{font-size:8px}}
</style></head><body><div class="card"><div class="head"><div class="kicker">SUKUNA MD // GENAI MENU</div><div class="title">C H R O M A</div><div class="sub">THREE PATHS · ONE CURSED INTERFACE</div></div><div class="identity"><span>USER <b>${safeUser || 'operator'}</b></span><span>v${safeVersion || '3.0.0'}</span><span>${safeStatus}</span></div><div class="grid">${columns}</div><div class="hint" id="hint">Tap a button to copy <b>${safePrefix}command</b> to your chat</div><div class="footer">✦ POWERED BY ${safeBot.toUpperCase()} · GENAI RICH RESPONSE ✦</div></div><script>(function(){window.runCommand=function(button){var command=button.getAttribute('data-command')||'';var hint=document.getElementById('hint');if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(command).then(function(){hint.innerHTML='Copied <b>'+command.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</b> — paste it in chat';}).catch(function(){hint.textContent='Use '+command+' in chat';});}else{hint.textContent='Use '+command+' in chat';}}})();</script></body></html>`;
}

async function sendChromaMenu({ sock, jid, caption, prefix = '.', botName, userTag, version, uptime, status, quoted }) {
    return sendRichHtml({
        sock,
        jid,
        quoted,
        html: chromaHtml({ prefix, botName, userTag, version, uptime, status, caption }),
    });
}

module.exports = { chromaHtml, sendChromaMenu, MENU_COLUMNS };

'use strict';

const fs = require('fs');
const path = require('path');
const { sendRichHtml, escapeHtml } = require('./genaiRich');

const DEFAULT_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCJho147XeEEuR1LA3s';
const DEFAULT_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'welcome.png');

const MENU_COLUMNS = [
    {
        title: 'Menu 1',
        commands: [
            ['menu2', 'menu'],
            ['menu3', 'cmdlist'],
            ['rich3', 'ttt'],
        ],
    },
    {
        title: 'Menu 2',
        commands: [
            ['test', 'ping'],
            ['me', 'profile'],
            ['rich2', 'snake'],
        ],
    },
];

function imageDataUri(imagePath) {
    if (!imagePath || !fs.existsSync(imagePath)) return '';
    try {
        const ext = path.extname(imagePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}`;
    } catch (_) {
        return '';
    }
}

function commandHref(prefix, command) {
    return `whatsapp://send?text=${encodeURIComponent(`${prefix}${command}`)}`;
}

function menuButton(label, command, prefix) {
    const safeLabel = escapeHtml(label);
    const href = escapeHtml(commandHref(prefix, command));
    return `<a class="menu-button" href="${href}" data-command="${escapeHtml(`${prefix}${command}`)}">${safeLabel}</a>`;
}

function chromaHtml({
    prefix = '.',
    botName = 'SUKUNA MD',
    userTag = '',
    imagePath = DEFAULT_IMAGE_PATH,
    channelUrl = DEFAULT_CHANNEL_URL,
} = {}) {
    const image = imageDataUri(imagePath);
    const safeBotName = escapeHtml(botName);
    const safeUserTag = escapeHtml(userTag || 'TsM Snøwi');
    const safeChannelUrl = escapeHtml(channelUrl);
    const columns = MENU_COLUMNS.map(column => {
        const buttons = column.commands.map(([label, command]) => menuButton(label, command, prefix)).join('');
        return `<div class="menu-column"><div class="column-title">${escapeHtml(column.title)}</div><div class="column-box">${buttons}</div></div>`;
    }).join('');
    const imageMarkup = image
        ? `<img class="hero" src="${image}" alt="${safeBotName} menu image">`
        : '<div class="hero placeholder">SUKUNA MD</div>';

    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:5px;background:#061b18;color:#f1f5ef}.card{overflow:hidden;padding:16px 13px 11px;border:1px solid #174d3d;border-radius:0 0 19px 19px;background:linear-gradient(180deg,#0d5a43 0,#09503d 42%,#0b5943 100%);box-shadow:0 8px 22px #0009}.topbar{margin:-16px -13px 15px;padding:10px 13px 11px;border-left:5px solid #b88cff;border-radius:0 0 11px 11px;background:#0c4a39;color:#eef8f0;font-size:15px}.topbar strong{font-weight:500}.verified{color:#168cff;text-shadow:0 0 0 #168cff;font-size:17px}.status{display:block;margin-top:7px;color:#b2c9c0;font-size:13px}.status:before{content:'◉';display:inline-block;margin-right:6px;color:#b6d0c7}.byline{margin:0 0 14px;color:#b5c6bf;font:italic 15px Arial,sans-serif}.title{margin:0 0 13px;color:#f7faf7;font:300 29px Arial,sans-serif;letter-spacing:-.5px}.hero{display:block;width:100%;height:202px;object-fit:cover;border-radius:12px;background:#0a201a}.placeholder{display:grid;place-items:center;color:#a9d5c2;font-size:23px}.menus{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:17px}.column-title{margin:0 0 7px;color:#b7cec4;font-size:18px;font-weight:300}.column-box{padding:12px 10px;border:1px solid #4e8875;border-radius:25px;background:#0b6048aa}.menu-button{display:flex;align-items:center;justify-content:center;min-height:48px;margin:0 0 10px;padding:7px 4px;border-radius:27px;background:linear-gradient(#242424,#1b1b1b);color:#f1f1f1;text-decoration:none;font-size:17px;font-weight:400;box-shadow:0 2px 0 #0c0c0c;transition:transform .12s ease,filter .12s ease,box-shadow .12s ease}.menu-button:last-child{margin-bottom:0}.menu-button:active{transform:translateY(3px) scale(.97);filter:brightness(1.28);box-shadow:0 0 0 #0c0c0c}.cta-row{display:flex;align-items:center;gap:10px;margin-top:22px;padding-top:10px;border-top:1px solid #4b8873}.channel{display:flex;align-items:center;justify-content:center;min-height:52px;flex:1;padding:8px 12px;border-radius:28px;background:linear-gradient(#28dc76,#18bf62);color:#063a25;text-decoration:none;font-size:17px;font-weight:400;box-shadow:0 2px 0 #087c41}.channel:active{transform:translateY(3px) scale(.98);filter:brightness(1.12);box-shadow:0 0 0 #087c41}.mark{display:grid;place-items:center;width:67px;height:67px;border:3px solid #f2faf4;border-radius:50%;color:#f2faf4;font:bold 19px Arial;letter-spacing:-2px}.footer{margin-top:9px;text-align:center;color:#8fb9aa;font:9px monospace}@media(max-width:300px){.hero{height:170px}.menus{gap:7px}.column-box{padding:9px 6px}.menu-button{font-size:14px}.title{font-size:26px}}
</style></head><body><div class="card"><div class="topbar"><strong>Meta AI</strong> <span class="verified">●</span> <strong>• Status</strong><span class="status">◉ Sticker pack</span></div><div class="byline">ⓘ &nbsp;By ${safeUserTag}</div><div class="title">Rich Menu</div>${imageMarkup}<div class="menus">${columns}</div><div class="cta-row"><a class="channel" href="${safeChannelUrl}" target="_blank" rel="noreferrer">Telegram channel</a><div class="mark">TSM</div></div><div class="footer">${safeBotName} · tap a button to open its command</div></div></body></html>`;
}

async function sendChromaMenu({ sock, jid, prefix = '.', userTag, botName, imagePath = DEFAULT_IMAGE_PATH, channelUrl = DEFAULT_CHANNEL_URL, quoted }) {
    return sendRichHtml({
        sock,
        jid,
        quoted,
        html: chromaHtml({ prefix, userTag, botName, imagePath, channelUrl }),
    });
}

module.exports = { chromaHtml, sendChromaMenu, MENU_COLUMNS, imageDataUri, menuButton };

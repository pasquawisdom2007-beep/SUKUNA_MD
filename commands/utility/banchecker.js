/**
 * banchecker — Accurate WhatsApp ban-status checker (2-factor detection)
 *
 * Usage:
 *   Reply to any message + .banchecker
 *   .banchecker <number>        (e.g. .banchecker 2349127814853)
 *
 * Uses the Baron Ban Checker API as the sole verdict source.
 * Users can edit BARON_API_KEY below before deploying, or provide
 * BANCHECK_API_KEY through the deployment environment.
 */
'use strict';

const { sendRichHtml, escapeHtml } = require('../../utils/genaiRich');

const BARON_API_BASE = 'https://baron0.com';
// Edit this value before deploying if you do not use environment variables.
// Never commit a real key to a public repository.
const BARON_API_KEY = process.env.BANCHECK_API_KEY || 'PASTE_YOUR_BARON_API_KEY_HERE';
const PLACEHOLDER_KEY = 'PASTE_YOUR_BARON_API_KEY_HERE';

async function checkWithBaron(number) {
    if (!BARON_API_KEY) return null;
    const res = await fetch(`${BARON_API_BASE}/api/v2/check`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${BARON_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ number: `+${number}` }),
        signal: AbortSignal.timeout(20000),
    });

    let body;
    try {
        body = await res.json();
    } catch (_) {
        throw new Error(`Baron API returned HTTP ${res.status} with a non-JSON response`);
    }

    if (!res.ok) {
        const detail = body?.detail || body?.error || `HTTP ${res.status}`;
        const requestId = body?.requestId ? ` (requestId: ${body.requestId})` : '';
        throw new Error(`${body?.title || 'Baron API error'}: ${detail}${requestId}`);
    }
    if (typeof body?.banned !== 'boolean') {
        throw new Error('Baron API returned an invalid ban result');
    }
    return body;
}

// ── Number parsing ───────────────────────────────────────────────────
function normalizeNumber(input) {
    if (!input) return null;
    let num = String(input).replace(/[^0-9+]/g, '');
    if (!num) return null;
    if (num.startsWith('+')) num = num.slice(1);
    if (num.endsWith('@s.whatsapp.net')) {
        num = num.replace('@s.whatsapp.net', '');
    }
    if (num.length < 8 || num.length > 15) return null;
    return num;
}

// ── Country lookup ───────────────────────────────────────────────────
function getCountry(num) {
    const codes = [
        ['1', 'United States/Canada'], ['20', 'Egypt'], ['27', 'South Africa'],
        ['30', 'Greece'], ['31', 'Netherlands'], ['33', 'France'],
        ['34', 'Spain'], ['36', 'Hungary'], ['39', 'Italy'],
        ['43', 'Austria'], ['44', 'United Kingdom'], ['45', 'Denmark'],
        ['46', 'Sweden'], ['47', 'Norway'], ['48', 'Poland'],
        ['49', 'Germany'], ['51', 'Peru'], ['52', 'Mexico'],
        ['54', 'Argentina'], ['55', 'Brazil'], ['56', 'Chile'],
        ['57', 'Colombia'], ['58', 'Venezuela'], ['60', 'Malaysia'],
        ['61', 'Australia'], ['62', 'Indonesia'], ['63', 'Philippines'],
        ['64', 'New Zealand'], ['65', 'Singapore'], ['66', 'Thailand'],
        ['81', 'Japan'], ['82', 'South Korea'], ['84', 'Vietnam'],
        ['86', 'China'], ['90', 'Turkey'], ['91', 'India'],
        ['92', 'Pakistan'], ['93', 'Afghanistan'], ['94', 'Sri Lanka'],
        ['95', 'Myanmar'], ['98', 'Iran'],
        ['212', 'Morocco'], ['213', 'Algeria'], ['216', 'Tunisia'],
        ['218', 'Libya'], ['220', 'Gambia'], ['221', 'Senegal'],
        ['222', 'Mauritania'], ['223', 'Mali'], ['224', 'Guinea'],
        ['225', 'Ivory Coast'], ['226', 'Burkina Faso'], ['227', 'Niger'],
        ['228', 'Togo'], ['229', 'Benin'], ['230', 'Mauritius'],
        ['231', 'Liberia'], ['232', 'Sierra Leone'], ['233', 'Ghana'],
        ['234', 'Nigeria'], ['235', 'Chad'], ['237', 'Cameroon'],
        ['243', 'DR Congo'], ['254', 'Kenya'], ['255', 'Tanzania'],
        ['256', 'Uganda'], ['257', 'Burundi'], ['258', 'Mozambique'],
        ['260', 'Zambia'], ['263', 'Zimbabwe'], ['267', 'Botswana'],
        ['268', 'Eswatini'], ['269', 'Comoros'],
    ];
    const sorted = codes.slice().sort((a, b) => b[0].length - a[0].length);
    for (const [code, name] of sorted) {
        if (num.startsWith(code)) return name;
    }
    return 'Unknown';
}

function plain(value) {
    return String(value || '').replace(/[ *_`]/g, '').replace(/\n{3,}/g, '\n\n');
}

function renderBanGenAI({ target, country, result, extras, registered, devices, page }) {
    const status = plain(result.status);
    const isBanned = /\bBANNED\b|OFF-WHATSAPP/i.test(status);
    const isActive = /active|unbanned/i.test(status);
    const tone = isBanned ? 'blood' : isActive ? 'alive' : 'warning';
    const icon = isBanned ? '☠' : isActive ? '✓' : '⚠';
    const registry = result.source === 'BARON' ? 'VERIFIED' : registered === true ? 'FOUND' : registered === false ? 'NOT FOUND' : 'TIMEOUT';
    const deviceCount = result.source === 'BARON' ? 'BARON API' : devices === null ? 'N/A' : String(devices.length);
    const profileState = page?.ok ? (page.generic ? 'HIDDEN' : 'VISIBLE') : 'TIMEOUT';
    const safe = value => escapeHtml(plain(value));
    const safeNumber = escapeHtml('+' + target);
    const safeCountry = escapeHtml(country);
    const profile = result.profile ? `<div class="profile">PROFILE: ${safe(result.profile)}</div>` : '';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:#08040a;color:#f7e8ef}.card{padding:13px;border:2px solid #ff3158;border-radius:20px;background:#16070e;color:#f7e8ef;box-shadow:inset 0 0 0 3px #3e0d1c,0 8px 20px #000b}.title{text-align:center;color:#fff;font:bold 22px Arial Black,Arial,sans-serif;letter-spacing:1px;text-shadow:0 0 10px #ff1744}.sub{text-align:center;margin:2px 0 8px;color:#d58b9d;font:10px monospace}.scan{height:4px;margin:0 12px 8px;background:#ff1744;box-shadow:0 0 10px #ff1744;animation:scan 1.8s linear infinite}.verdict{display:flex;align-items:center;gap:9px;padding:9px;border:1px solid #ff3158;border-radius:10px;background:#090307}.verdict.alive{border-color:#36e58a}.verdict.warning{border-color:#ffbf55}.sig{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#3b0714;color:#ff3158;font-size:20px}.alive .sig{background:#062b1b;color:#36e58a}.warning .sig{background:#2e2108;color:#ffbf55}.label{color:#a7687a;font:8px monospace;letter-spacing:1px}.value{margin-top:2px;color:#fff;font:bold 13px monospace}.number{text-align:center;margin:9px 0;color:#ffdce5;font:bold 16px monospace}.profile{text-align:center;margin:-4px 0 8px;color:#ff9cb1;font:9px monospace}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.metric{padding:7px;border:1px solid #5d1b2b;border-radius:8px;background:#0b0307}.metric .value{font-size:10px;color:#ffb1c1}.detail{margin-top:8px;padding:8px;border-left:3px solid #ff1744;background:#210710;color:#f2d8df;white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.4 monospace}.extras{margin-top:7px;color:#b98b99;white-space:pre-wrap;font:9px/1.35 monospace}.buttons{display:flex;gap:6px;margin-top:9px}.buttons button{flex:1;height:36px;border:1px solid #a71b3c;border-radius:8px;background:#3a0c1b;color:#ffdce5;font:bold 9px monospace}.buttons button:active{transform:scale(.95)}.footer{text-align:center;margin-top:8px;color:#884455;font:8px monospace;letter-spacing:1px}@keyframes scan{50%{opacity:.35}100%{opacity:1}}
</style></head><body><div class="card"><div class="title">☠ BAN CHECKER ☠</div><div class="sub">SUKUNA MD // WHATSAPP ACCOUNT FORENSICS</div><div class="scan"></div><div class="verdict ${tone}"><div class="sig">${icon}</div><div><div class="label">FINAL VERDICT</div><div class="value">${safe(status)}</div></div></div><div class="number">${safeNumber}</div>${profile}<div class="grid"><div class="metric"><div class="label">REGISTRY</div><div class="value">${registry}</div></div><div class="metric"><div class="label">KEY DEVICES</div><div class="value">${deviceCount}</div></div><div class="metric"><div class="label">PUBLIC PROFILE</div><div class="value">${profileState}</div></div><div class="metric"><div class="label">REGION</div><div class="value">${safeCountry}</div></div></div><div class="detail">${safe(result.detail)}</div><div class="extras">${safe(extras || 'No carrier data returned.')}</div><div class="buttons"><button id="pulse">PULSE SCAN</button><button id="copy">COPY NUMBER</button><button id="evidence">EVIDENCE</button></div><div class="footer">GENAI RICH RESPONSE · ${result.source === 'BARON' ? 'BARON API VERIFICATION' : 'REGISTRY + PROFILE + KEY CHECK'}</div></div><script>(function(){var card=document.querySelector('.card'),pulse=document.getElementById('pulse'),copy=document.getElementById('copy'),evidence=document.getElementById('evidence');pulse.onclick=function(){card.style.opacity='.45';setTimeout(function(){card.style.opacity='1'},180)};copy.onclick=function(){copy.textContent='COPIED ✓';setTimeout(function(){copy.textContent='COPY NUMBER'},1200)};evidence.onclick=function(){evidence.textContent='CHECKS COMPLETE';setTimeout(function(){evidence.textContent='EVIDENCE'},1400)}})();</script></body></html>`;
}

// ── Command ──────────────────────────────────────────────────────────
module.exports = {
    name: 'banchecker',
    aliases: ['bancheck', 'checkban', 'isbanned', 'numbercheck'],
    description: 'Accurately check if a WhatsApp number is banned or active',
    usage: '.banchecker <number> or reply + .banchecker',
    category: 'utility',
    async execute({ sock, msg, from, reply, args, isOwner }) {
        if (!isOwner) return reply('❌ *Owner only!*');

        let target = null;
        try {
            const ci =
                msg.message?.extendedTextMessage?.contextInfo ||
                msg.message?.imageMessage?.contextInfo ||
                msg.message?.videoMessage?.contextInfo ||
                msg.message?.documentMessage?.contextInfo ||
                msg.message?.audioMessage?.contextInfo;
            const who = ci?.participant || ci?.remoteJid;
            if (who && who.endsWith('@s.whatsapp.net')) target = normalizeNumber(who);
        } catch (_) { /* use command argument instead */ }

        if (!target) target = normalizeNumber((args[0] || '').trim());
        if (!target) {
            return reply(
                `*╔══ 🛡️ BAN CHECKER ══╗*\n` +
                `║  Baron API verification  ║\n` +
                `╚════════════════════╝\n\n` +
                `*Usage:*\n` +
                `▸ Reply to a user + *.banchecker*\n` +
                `▸ .banchecker <number>\n\n` +
                `*Example:* .banchecker 2349127814853`
            );
        }

        if (!BARON_API_KEY || BARON_API_KEY === PLACEHOLDER_KEY) {
            return reply('❌ Baron API key is not configured. Edit BARON_API_KEY in commands/utility/banchecker.js or set BANCHECK_API_KEY, then restart the bot.');
        }

        try {
            const baron = await checkWithBaron(target);
            const isBanned = baron.banned === true;
            const result = {
                emoji: isBanned ? '🔴' : '🟢',
                status: isBanned ? 'BANNED' : 'UNBANNED — ACTIVE',
                detail: isBanned
                    ? `Baron verified that +${target} is *BANNED*${baron.reason ? `\n_Reason: ${baron.reason}_` : '.'}`
                    : `Baron verified that +${target} is *not banned* and can use WhatsApp normally.`,
                profile: null,
                source: 'BARON',
            };
            return await sendRichHtml({
                sock,
                jid: from,
                quoted: msg,
                html: renderBanGenAI({
                    target,
                    country: getCountry(target),
                    result,
                    extras: 'Source: Baron Ban Checker API\n',
                    registered: null,
                    devices: null,
                    page: null,
                }),
            });
        } catch (error) {
            console.error('[banchecker] Baron API failed:', error.message);
            return reply(`❌ Baron ban check failed: ${error.message}\nTry again or verify the API key.`);
        }
    }
};

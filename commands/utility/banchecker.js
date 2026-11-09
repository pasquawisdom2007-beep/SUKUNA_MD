/**
 * banchecker — Accurate WhatsApp ban-status checker (2-factor detection)
 *
 * Usage:
 *   Reply to any message + .banchecker
 *   .banchecker <number>        (e.g. .banchecker 2349127814853)
 *
 * Uses the Baron Ban Checker API as the sole verdict source.
 * Set BAN_CHECKER_API_KEY below or use BANCHECK_API_KEY / BARON_API_KEY.
 * Never commit a live API key to a public repository.
 */
'use strict';

const { sendSukunaBanCanvas } = require('../../utils/genaiRich');

const BARON_API_BASE = 'https://baron0.com';
// Paste your API key between these quotes; this value takes priority.
const BAN_CHECKER_API_KEY = '';
const BARON_API_KEY = String(BAN_CHECKER_API_KEY || process.env.BANCHECK_API_KEY || process.env.BARON_API_KEY || '').trim();

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

async function getAppealStatus(number) {
    if (!BARON_API_KEY) return null;
    const url = `${BARON_API_BASE}/api/v2/appeal-status?phone=${encodeURIComponent(`+${number}`)}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${BARON_API_KEY}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(body?.error || `Appeal status API returned HTTP ${res.status}`);
    return body && typeof body === 'object' ? body : null;
}

function classifyBan(data = {}, appeal = null) {
    if (!data.banned) return 'NONE';
    const type = String(appeal?.ban_type || data.ban_type || '').toLowerCase();
    if (appeal?.is_perma === true || /perma|hard/.test(type)) return 'PERMANENT';
    if (appeal?.is_perma === false || /temp|soft|temporary/.test(type)) return 'TEMPORARY';
    return 'UNKNOWN';
}

function formatUtc(value) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace(/\.\d+Z$/, ' UTC');
}

function formatElapsed(value, now = Date.now()) {
    if (!value) return null;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time) || time > now) return null;
    let seconds = Math.floor((now - time) / 1000);
    const days = Math.floor(seconds / 86400); seconds %= 86400;
    const hours = Math.floor(seconds / 3600); seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    if (days >= 365) return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo ago`;
    if (days >= 30) return `${Math.floor(days / 30)}mo ${days % 30}d ago`;
    if (days) return `${days}d ${hours}h ago`;
    if (hours) return `${hours}h ${minutes}m ago`;
    return `${minutes}m ago`;
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

// ── Command ──────────────────────────────────────────────────────────
module.exports = {
    name: 'banchecker',
    aliases: ['checkban', 'isbanned', 'numbercheck'],
    description: 'Accurately check if a WhatsApp number is banned or active',
    usage: '.banchecker <number> or reply + .banchecker',
    category: 'utility',
    async execute({ sock, msg, from, reply, args, isOwner }) {
        if (!isOwner) return reply('❌ *Owner only!*');

        const numberArgs = args;

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

        if (!target) target = normalizeNumber(numberArgs.join(' ').trim());
        if (!target) {
            return reply(
                `*╔══ 🛡️ BAN CHECKER ══╗*\n` +
                `║  Baron API verification  ║\n` +
                `╚════════════════════╝\n\n` +
                `*Usage:*\n` +
                `▸ Reply to a user + *.banchecker*\n` +
                `▸ .banchecker <number>\n` +
                `*Example:* .banchecker 2349127814853`
            );
        }

        if (!BARON_API_KEY) {
            return reply('❌ Baron API key is not configured. Paste it into BAN_CHECKER_API_KEY near the top of commands/utility/banchecker.js, or set BANCHECK_API_KEY / BARON_API_KEY in the environment. Then restart the bot.');
        }

        try {
            const baron = await checkWithBaron(target);
            if (!baron) return reply('❌ Ban checker API key is not configured. Paste it into BAN_CHECKER_API_KEY near the top of commands/utility/banchecker.js, or set BANCHECK_API_KEY / BARON_API_KEY in the environment.');
            const isBanned = baron.banned === true;
            let appeal = null;
            if (isBanned) {
                try { appeal = await getAppealStatus(target); }
                catch (error) { console.warn('[banchecker] Appeal status unavailable:', error.message); }
            }
            const reviewAvailable = isBanned && baron.in_app_ban_appeal === true;
            const banKind = classifyBan(baron, appeal);
            const banTimestamp = appeal?.ban_time || baron.ban_time || baron.banTime || null;
            const reviewTimestamp = appeal?.appeal_creation_time || null;
            const details = {
                banKind,
                banType: appeal?.ban_type || baron.ban_type || null,
                banTime: formatUtc(banTimestamp),
                banAge: formatElapsed(banTimestamp),
                appealStatus: appeal?.status || null,
                reviewTime: formatUtc(reviewTimestamp),
                reason: appeal?.reason || baron.violation_reason || baron.violation_label || null,
                category: baron.violation_category || null,
                isEu: typeof baron.is_eu === 'boolean' ? baron.is_eu : null,
            };
            return await sendSukunaBanCanvas({
                sock,
                jid: from,
                quoted: msg,
                number: target,
                banned: isBanned,
                details,
                reviewAvailable,
            });
        } catch (error) {
            console.error('[banchecker] Baron API failed:', error.message);
            return reply(`❌ Baron ban check failed: ${error.message}\nTry again or verify the API key.`);
        }
    },

    // Shared API helpers used by .bancheck and isolated regression tests.
    checkWithBaron,
    getAppealStatus,
    classifyBan,
    formatUtc,
    formatElapsed,
    normalizeNumber,
    getCountry,
};

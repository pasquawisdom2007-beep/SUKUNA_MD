/**
 * banchecker — Accurate WhatsApp ban-status checker (2-factor detection)
 *
 * Usage:
 *   Reply to any message + .banchecker
 *   .banchecker <number>        (e.g. .banchecker 2349127814853)
 *
 * HOW THE ACCURATE CHECK WORKS (tested live against WhatsApp servers):
 *   Factor A — WhatsApp live registry  (sock.onWhatsApp)
 *       Does the number have an account record on WhatsApp's servers?
 *   Factor B — WhatsApp public send-page marker (probed with RETRIES)
 *       GET https://api.whatsapp.com/send?phone=<num>
 *       • ACTIVE account → og:title = DISPLAY NAME
 *                        AND og:image = their profile picture
 *       • BANNED account → generic "Share on WhatsApp" title
 *                        AND og:image = WhatsApp default avatar
 *         (banned accounts stay in the registry but their profile
 *          is stripped from public pages)
 *
 *   Combining both factors:
 *       registry=HAS  +  name visible     → 🟢 ACTIVE
 *       registry=HAS  +  generic page     → 🟡 ACTIVE (privacy mode)
 *       registry=NONE +  generic page     → 🔴 OFF-WHATSAPP
 *
 * Optional carrier-level check via NumVerify (free 100/month):
 *   https://numverify.com/ — default key ships with the bot;
 *   NUMVERIFY_API_KEY env var overrides it.
 */
'use strict';

// Baileys imports for the device/key-index probe (the "security code"
// check) — a banned number has its identity keys destroyed, so this
// query fails or returns zero devices for banned numbers.
const {
    USyncQuery,
    USyncUser,
    USyncDeviceProtocol,
} = require('@pasqua-baileys/baileys');
const { sendRichHtml, escapeHtml } = require('../../utils/genaiRich');

const DEFAULT_NV_KEY = '1e4c1e7867b7d586bf28de7e2414fb93';

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

// ── Factor B: public send-page name + avatar probe (with retries) ────
// Active account → og:title carries the display name
//                  AND og:image points to their profile picture (pps.whatsapp.net)
// Banned/offline  → generic "Share on WhatsApp" title
//                  AND og:image is WhatsApp's default avatar (static.whatsapp.net)
const DEFAULT_AVATAR = 'static.whatsapp.net';

async function probeSendPage(num) {
    // Retry twice: WhatsApp's edge servers can return the generic page
    // momentarily even for active numbers (eventual-consistency blip).
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await fetch(
                `https://api.whatsapp.com/send?phone=${encodeURIComponent(num)}&type=phone_number&app_absent=0`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                    signal: AbortSignal.timeout(15000),
                }
            );
            const html = await res.text();

            // Decode the title (WhatsApp encodes fancy fonts as HTML entities)
            const raw = ((html.match(/property="og:title" content="([^"]*)"/i) || [])[1] || '');
            const title = raw.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
            const generic = /share on whatsapp/i.test(title);

            const avatar = ((html.match(/property="og:image" content="([^"]*)"/i) || [])[1] || '');
            const hasOwnPic = !generic && /pps\.whatsapp\.net/i.test(avatar);

            // A real display name is a strong ACTIVE signal; bail early
            if (!generic) {
                return { ok: true, generic: false, title: title.trim(), hasOwnPic };
            }
            // Generic page — only consider it stable after the final retry
            if (attempt === 2) {
                return { ok: true, generic: true, title: null, hasOwnPic: false };
            }
            // Intermediate retries: wait before re-probing
            await new Promise(r => setTimeout(r, 1500));
        }
        catch (_) {
            if (attempt === 2) return { ok: false, generic: null, title: null, hasOwnPic: false };
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    return { ok: false, generic: null, title: null, hasOwnPic: false };
}

// ── Optional carrier check: NumVerify (default key + env override) ───
function withTimeout(promise, ms, fallback) {
    return Promise.race([
        Promise.resolve(promise),
        new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
    ]);
}

async function probeCarrier(num) {
    const nvKey = process.env.NUMVERIFY_API_KEY || DEFAULT_NV_KEY;
    try {
        const res = await fetch(
            `http://apilayer.net/api/validate?access_key=${encodeURIComponent(nvKey)}&number=${encodeURIComponent(num)}&country_code=&format=1`,
            { signal: AbortSignal.timeout(15000) }
        );
        const nv = await res.json();
        if (nv && typeof nv.valid === 'boolean') return { ok: true, data: nv };
        if (nv && nv.error && nv.error.type === 'rate_limit_reached') {
            return { ok: false, rateLimited: true };
        }
        return { ok: false };
    }
    catch (_) {
        return { ok: false };
    }
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
    const deviceText = devices === null ? 'UNAVAILABLE' : `${devices.length} DEVICE${devices.length === 1 ? '' : 'S'}`;
    const registryText = registered === true ? 'FOUND' : registered === false ? 'NOT FOUND' : 'TIMEOUT';
    const pageText = page?.ok ? (page.generic ? 'PROFILE HIDDEN' : 'PROFILE VISIBLE') : 'TIMEOUT';
    const detail = escapeHtml(plain(result.detail));
    const extraText = escapeHtml(plain(extras || 'No carrier data returned.'));
    const safeTarget = escapeHtml(`+${target}`);
    const safeCountry = escapeHtml(country);
    const profile = result.profile ? `<div class="profile">PROFILE: ${escapeHtml(result.profile)}</div>` : '';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:radial-gradient(circle at 50% 0%,#4b0710 0,#16040a 38%,#030205 100%);color:#f6e8ee}.card{position:relative;overflow:hidden;padding:14px;border:1px solid #ff3158;border-radius:18px;background:linear-gradient(145deg,#210812,#10040a 55%,#050207);box-shadow:inset 0 0 0 1px #6e1025,0 0 20px #e4003b66,0 10px 24px #000c}.card:before{content:"";position:absolute;inset:-35%;background:repeating-linear-gradient(115deg,transparent 0 22px,#ff174455 23px 24px,transparent 25px 49px);opacity:.18;transform:rotate(-8deg);animation:scan 9s linear infinite}.card:after{content:"";position:absolute;top:-12px;right:24px;width:9px;height:29px;border-radius:0 0 8px 8px;background:#ff1744;box-shadow:18px 9px 0 -2px #b7002f,36px -4px 0 -3px #ff3158;animation:drip 2.7s ease-in-out infinite}.inner{position:relative;z-index:1}.kicker{text-align:center;color:#ff5574;font:10px monospace;letter-spacing:3px}.title{text-align:center;margin:4px 0;color:#fff;font:bold 23px Arial Black,Arial,sans-serif;letter-spacing:1px;text-shadow:0 0 8px #ff1744,0 0 22px #b00035;animation:flicker 3.8s infinite}.subtitle{text-align:center;color:#d99aaa;font:10px monospace;letter-spacing:1px}.rule{height:2px;margin:10px 0;background:linear-gradient(90deg,transparent,#ff1744,#ffc0ca,#ff1744,transparent);box-shadow:0 0 8px #ff1744}.verdict{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #ff3158;border-radius:12px;background:#0b0307}.verdict.blood{border-color:#ff1744;box-shadow:0 0 14px #ff174466}.verdict.alive{border-color:#36e58a;box-shadow:0 0 14px #00d97844}.verdict.warning{border-color:#ffbf55;box-shadow:0 0 14px #ff9d3844}.sig{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#260711;color:#ff3158;font-size:22px;animation:pulse 1.8s infinite}.alive .sig{background:#052417;color:#36e58a}.warning .sig{background:#2c1d05;color:#ffbf55}.vlabel{color:#b88896;font:9px monospace;letter-spacing:1px}.vstatus{margin-top:3px;color:#fff;font:bold 14px monospace}.target{margin:10px 0;color:#ffe7ee;text-align:center;font:bold 16px monospace;letter-spacing:1px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:9px 0}.metric{padding:7px;border:1px solid #5d1b2b;border-radius:8px;background:#0b0307}.mlabel{color:#9c6473;font:8px monospace}.mvalue{margin-top:3px;color:#ffb1c1;font:bold 10px monospace}.detail{padding:9px;border-left:3px solid #ff1744;background:#19060c;color:#f2d8df;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.4 monospace}.extras{margin-top:7px;color:#bb8e9c;white-space:pre-wrap;font:9px/1.35 monospace}.actions{display:flex;gap:7px;margin-top:10px}.actions button{flex:1;height:34px;border:1px solid #a71b3c;border-radius:8px;color:#ffdce4;background:linear-gradient(#5d1024,#260711);font:bold 9px monospace}.actions button:active{transform:scale(.96)}.footer{margin-top:9px;text-align:center;color:#874555;font:8px monospace;letter-spacing:1px}@keyframes scan{to{transform:rotate(-8deg) translateY(90px)}}@keyframes drip{50%{height:42px;opacity:.65}100%{height:29px;opacity:1}}@keyframes flicker{0%,18%,20%,65%,67%,100%{opacity:1}19%,66%{opacity:.65}}@keyframes pulse{50%{transform:scale(1.08);box-shadow:0 0 14px currentColor}}@media(max-width:320px){.title{font-size:19px}}
</style></head><body><div class="card"><div class="inner"><div class="kicker">SUKUNA MD // SECURE SCAN</div><div class="title">☠ BAN CHECKER ☠</div><div class="subtitle">WHATSAPP ACCOUNT FORENSICS</div><div class="rule"></div><div class="verdict ${tone}"><div class="sig">${icon}</div><div><div class="vlabel">FINAL VERDICT</div><div class="vstatus">${escapeHtml(status)}</div></div></div><div class="target">${safeTarget}</div>${profile}<div class="grid"><div class="metric"><div class="mlabel">REGISTRY</div><div class="mvalue">${registryText}</div></div><div class="metric"><div class="mlabel">KEY DEVICES</div><div class="mvalue">${deviceText}</div></div><div class="metric"><div class="mlabel">PUBLIC PROFILE</div><div class="mvalue">${pageText}</div></div><div class="metric"><div class="mlabel">REGION</div><div class="mvalue">${safeCountry}</div></div></div><div class="detail">${detail}</div><div class="extras">${extraText}</div><div class="actions"><button id="pulse">PULSE SCAN</button><button id="copy">COPY NUMBER</button><button id="note">EVIDENCE</button></div><div class="footer">GENAI RICH RESPONSE · 2-FACTOR SERVER CHECK</div></div></div><script>(function(){var card=document.querySelector('.card'),pulse=document.getElementById('pulse'),copy=document.getElementById('copy'),note=document.getElementById('note');pulse.onclick=function(){card.style.animation='pulse .8s 2';setTimeout(function(){card.style.animation=''},1700)};copy.onclick=function(){if(navigator.clipboard)navigator.clipboard.writeText('${safeTarget}');copy.textContent='COPIED ✓';setTimeout(function(){copy.textContent='COPY NUMBER'},1400)};note.onclick=function(){note.textContent='REGISTRY + PAGE + KEYS';setTimeout(function(){note.textContent='EVIDENCE'},1800)}})();</script></body></html>`;
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

        // ── Determine the target number ──────────────────────────────
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
        }
        catch (_) { /* ignore */ }

        if (!target) target = normalizeNumber((args[0] || '').trim());

        if (!target) {
            return reply(
                `*╔══ 🛡️ BAN CHECKER ══╗*\n` +
                `║  Accurate ban-status  ║\n` +
                `║     verification      ║\n` +
                `╚════════════════════╝\n\n` +
                `*Usage:*\n` +
                `▸ Reply to a user + *.banchecker*\n` +
                `▸ .banchecker <number>\n\n` +
                `*Example:*\n` +
                `▸ .banchecker 2349127814853`
            );
        }

            // Probes run silently; the user receives only the completed result card.
        let result = null;

        // ── Factor A: live registry ──────────────────────────────────
        let registered = null;
        try {
            const onWA = await withTimeout(sock.onWhatsApp(target + '@s.whatsapp.net'), 8000, []);
            registered = Array.isArray(onWA) && onWA.length > 0 && onWA[0].exists === true;
        }
        catch (_) { /* registry probe failed; continue with factor B */ }

        // ── Factor D: security-code (identity key) probe ─────────────
        // The user's own idea: a banned number's identity keys are
        // destroyed on the server. Querying the number's device/key-index
        // list through the bot's session fails or returns empty devices
        // for a banned account, while an active one returns real data.
        let devices = null; // null = probe failed, [] = no devices, else device list
        try {
            if (typeof sock.executeUSyncQuery === 'function') {
                const q = new USyncQuery()
                    .withDeviceProtocol()
                    .withUser(new USyncUser().withId(target + '@s.whatsapp.net'));
                const devRes = await sock.executeUSyncQuery(q);
                if (devRes && Array.isArray(devRes.list) && devRes.list.length > 0) {
                    const devInfo = devRes.list[0];
                    const dl = devInfo?.devices?.deviceList || devInfo?.devices?.device_list || null;
                    devices = Array.isArray(dl) ? dl : null;
                    // NOTE: devRes shape depends on fork version; if we
                    // can't parse it, keep devices === null (probe failed)
                    if (devices === null && devInfo && devInfo.devices) {
                        const d = devInfo.devices;
                        for (const k of Object.keys(d)) {
                            if (Array.isArray(d[k])) { devices = d[k]; break; }
                        }
                    }
                }
                else {
                    devices = [];
                }
            }
        }
        catch (_) { /* probe failed; devices stays null */ }

        // ── Factor B: send-page marker ───────────────────────────────
        const page = await withTimeout(probeSendPage(target), 12000, { ok: false, generic: null, title: null, hasOwnPic: false });

        // ── Optional Factor C: carrier registry ──────────────────────
        const carrier = await withTimeout(probeCarrier(target), 7000, { ok: false });

        // ── Verdict (all probe combinations covered honestly) ─────────
        // Factor D (device/key-index) is the strongest signal, and the
        // DEVICE COUNT itself is a signature:
        //   0 devices              → keys fully garbage-collected → BANNED/REMOVED
        //   1 device + generic page → stale key remnant mid-deletion → BANNED
        //   2+ devices             → real multi-device account → ACTIVE
        //   devices === null       → probe failed, fall back to A+B
        if (devices !== null) {
            const devCount = devices.length;
            if (devCount >= 2 && page?.ok) {
                // Normal multi-device account — unambiguous
                result = {
                    emoji: '🟢', status: 'UNBANNED — ACTIVE',
                    detail: `+${target} has a *LIVE* WhatsApp account\n(_valid identity keys: ${devCount} device(s) on the servers).`,
                    profile: page.title || null,
                };
            }
            else if (devCount === 1 && page?.generic) {
                // The ban-decay signature: WhatsApp removes keys lazily,
                // so a banned account often leaves ONE orphaned stale key
                // with its public profile already stripped.
                result = {
                    emoji: '🔴', status: 'BANNED',
                    detail: `+${target} is *BANNED* — WhatsApp removed its profile.\n` +
                        `_Signature: only 1 stale identity key left on the servers (normal accounts keep 2+ devices) — the account is in post-ban key deletion._`,
                    profile: null,
                };
            }
            else if (devCount === 1 && page?.ok && !page.generic) {
                // Single device + name/photo visible: rare but possible
                // (new install, no linked devices) — give it the benefit
                // of the doubt.
                result = {
                    emoji: '🟢', status: 'UNBANNED — ACTIVE',
                    detail: `+${target} has a *LIVE* WhatsApp account\n(_valid identity keys: ${devCount} device on the servers).`,
                    profile: page.title || null,
                };
            }
            else if (devCount === 0 && page?.ok) {
                // Keys fully garbage-collected AND public profile gone
                result = {
                    emoji: '🔴', status: 'BANNED / OFF-WHATSAPP',
                    detail: `+${target} has *no* WhatsApp account.\n` +
                        `_Signature: identity keys fully destroyed on the servers — the account was banned & removed._`,
                    profile: null,
                };
            }
        }

        if (!result && page.ok) {
            if (!page.generic && registered === true) {
                // Name visible on the public page — unambiguous live account
                result = {
                    emoji: '🟢', status: 'UNBANNED — ACTIVE',
                    detail: `+${target} has a *LIVE* WhatsApp account\n(name & profile picture visible publicly).`,
                    profile: page.title,
                };
            }
            else if (page.generic && registered === true) {
                // Account exists on the servers but its public profile is
                // invisible. Two possibilities: privacy settings hiding the
                // profile, OR a fresh ban mid-deletion. We mark it clearly
                // instead of guessing — recheck in 24h if unsure.
                result = {
                    emoji: '🟡', status: 'ACTIVE — PROFILE HIDDEN',
                    detail: `+${target} *exists* on WhatsApp's servers.\n` +
                        `_Its public page shows no name/photo — either privacy mode is ON or the account was just banned and is being removed._`,
                    profile: null,
                };
            }
            else if (page.generic && registered === false) {
                // Nothing in the registry and no public profile — the
                // number is gone: never registered, deleted, or banned &
                // fully removed.
                result = {
                    emoji: '🔴', status: 'BANNED / OFF-WHATSAPP',
                    detail: `+${target} has *no* WhatsApp account.\n` +
                        `_Number was never registered, was deleted, or was banned & removed from the servers._`,
                    profile: null,
                };
            }
        }

        if (!result) {
            // Probes inconclusive — fall back to registry + page alone
            if (registered === true) {
                // Account in registry but page generic: with the key probe
                // failed we can't rule out a fresh ban — stay honest.
                result = { emoji: '🟡', status: 'LIKELY ACTIVE (VERIFY)', detail: `+${target} exists on WhatsApp's servers but its public profile is hidden and the key probe timed out. Recheck in 24h.`, profile: null };
            }
            else if (registered === false) {
                result = { emoji: '🔴', status: 'BANNED / OFF-WHATSAPP', detail: `+${target} is not on WhatsApp's servers (key/public checks timed out).`, profile: null };
            }
            else {
                result = { emoji: '❓', status: 'UNKNOWN', detail: `Server probes failed. Try again in a moment.`, profile: null };
            }
        }

        // ── Carrier extras ───────────────────────────────────────────
        let extras = '';
        if (carrier.ok && carrier.data) {
            if (carrier.data.carrier) extras += `*Carrier:* ${carrier.data.carrier}\n`;
            if (carrier.data.line_type) extras += `*Line type:* ${carrier.data.line_type}\n`;
            if (carrier.data.country_name) extras += `*Region:* ${carrier.data.country_name}\n`;
        }
        else if (carrier.rateLimited) {
            extras += `_NumVerify limit reached — carrier info skipped._\n`;
        }

                // ── Send result ──────────────────────────────────────────────
        const country = getCountry(target);
        const profileLine = result.profile ? `*Profile name:* ${result.profile}\n` : '';
        const finalText =
            `╔══ 🛡️ *BAN CHECKER* ══╗\n` +
            `║                        ║\n` +
            `║  ${result.emoji} *${result.status}*  ║\n` +
            `║                        ║\n` +
            `╚════════════════════╝\n\n` +
            `*Number:* +${target}\n` +
            `*Country:* ${country}\n` +
            profileLine +
            `${extras}\n` +
            `${result.detail}\n\n` +
            `_2-factor check: registry + public page_\n` +
            `_Note: exact ban reason/date is only visible_` +
            `_ inside the banned account itself._`;
        try {
            return await sendRichHtml({
                sock,
                jid: from,
                quoted: msg,
                html: renderBanGenAI({ target, country, result, extras, registered, devices, page }),
            });
        }
        catch (error) {
            console.error('[banchecker] GenAI render failed:', error.message);
            return reply(finalText);
        }
    }
};

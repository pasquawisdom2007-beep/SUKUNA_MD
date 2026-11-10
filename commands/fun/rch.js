'use strict';

/**
 * .rch — react to a WhatsApp CHANNEL UPDATE (Omegatech VIP reaction API)
 * =====================================================================
 *
 *  Usage
 *    .rch <channel post link> <emoji>
 *    .rch                                        ← usage card
 *    (reply to a forwarded channel post) .rch <emoji>
 *
 *  What changed in this build
 *  --------------------------
 *  • The endpoint is  https://api.omegatech.app/api/Fun/Rch  (the `/api`
 *    segment is mandatory — without it the host answers a 404 HTML page,
 *    which is what made earlier builds look like an "API failure").
 *  • The query string is built exactly once, with URLSearchParams. Previously
 *    a pasted base like `…/Fun/Rch?action=react&url=` produced
 *    `?action=react&url=&action=react&url=…`; Express then sees
 *    `action: ['react','react']` and answers
 *    `Unknown action. Use react | sync | keys` — the exact message in the
 *    failing screenshots.
 *  • No default emoji. The API requires `emoji`; if the user does not send
 *    one we explain and stop — the bot never invents a reaction.
 *  • No auto-join. Auto-join is a *pairing* behaviour owned by
 *    utils/autoJoin.js on `connection.open`; `.rch` no longer triggers it.
 *  • Every failure mode is classified (quota / busy / bad action / missing
 *    param / 404 page / network) so the console and the WhatsApp reply say
 *    something you can act on.
 *
 *  Verified API contract (probed live)
 *    GET  /api/Fun/Rch?action=keys                 → { success:true, data:{ keys:[…] } }
 *    GET  /api/Fun/Rch?action=sync                 → { success:true, data:{ synced:n, keys:[…] } }
 *    GET  /api/Fun/Rch?action=react&url=&emoji=    → 400 "url is required (WhatsApp channel message link)"
 *    GET  /api/Fun/Rch?action=react&url=…          → 400 "emoji is required"
 *    GET  /api/Fun/Rch?action=<anything else>      → 400 "Unknown action. Use react | sync | keys"
 *    daily cap reached                             → 500 "Limit harian API (50x reaksi)…"
 *    upstream busy                                 → 500 "Server Sedang Sibuk, Cobalah Beberapa Saat Lagi."
 *    wrong path (no /api)                          → 404 HTML page
 */

let config = {};
try { config = require('../../config') || {}; } catch (_) { config = {}; }

const ui = require('../../utils/consoleUI');

const DEFAULT_API_BASE = 'https://api.omegatech.app/api/Fun/Rch';
const MAX_EMOJI_LEN = 16;
const TAG = 'RCH';

/** https://whatsapp.com/channel/<invite>/<postId> */
const CHANNEL_POST_RE = /https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})\/(\d{1,24})/i;
/** https://whatsapp.com/channel/<invite>  (no post id) */
const CHANNEL_BASE_RE = /https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})\/?(?:[?#]\S*)?$/i;
/** bare  <invite>/<postId>  typed after the command */
const BARE_RE = /(?:^|\s)([A-Za-z0-9_-]{12,})\/(\d{1,24})(?=\s|$)/;
/** an emoji cluster, ZWJ sequences and skin tones included */
const EMOJI_RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}|\p{Regional_Indicator})|[\u{1F3FB}-\u{1F3FF}])*/gu;

/** Explicitly typed word → emoji. Nothing here is applied unless the user wrote it. */
const EMOJI_ALIASES = new Map(Object.entries({
    fire: '🔥', flame: '🔥', heart: '❤️', love: '❤️', red: '❤️',
    like: '👍', thumbsup: '👍', ok: '👌', clap: '👏', pray: '🙏',
    laugh: '😂', lol: '😂', cry: '😭', sad: '😢', wow: '😮',
    star: '⭐', sparkle: '✨', check: '✅', crown: '👑', skull: '💀',
    money: '💰', rocket: '🚀', eyes: '👀', hundred: '💯', party: '🎉',
}));

// ── configuration ────────────────────────────────────────────────────

function reactionCfg() {
    return (config && config.reaction) || {};
}

/**
 * Normalise whatever sits in RCH_API_BASE / config.reaction.apiBase:
 *  • drop any pasted `?query` or `#hash`   (duplicate `action` source)
 *  • force https:// when the host was typed bare
 *  • repair `…/Fun/Rch` → `…/api/Fun/Rch`
 * @returns {string} a clean, query-less endpoint
 */
function normalizeApiBase(raw) {
    let base = String(raw || '').trim() || DEFAULT_API_BASE;
    base = base.split('#')[0].split('?')[0].trim();
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`;

    const match = base.match(/^(https?:\/\/[^/]+)\/?(.*)$/i);
    if (!match) return DEFAULT_API_BASE;

    const host = match[1];
    let path = (match[2] || '').replace(/^\/+|\/+$/g, '');
    path = path.replace(/^api\/api\//i, 'api/').replace(/^api\/api$/i, 'api');
    if (!path || /^fun\/rch$/i.test(path)) path = 'api/Fun/Rch';
    return `${host}/${path}`;
}

function apiBase() {
    return normalizeApiBase(reactionCfg().apiBase || DEFAULT_API_BASE);
}

function timeoutMs() {
    const value = Number(reactionCfg().timeoutMs || 120000);
    return Number.isFinite(value) && value > 0 ? value : 120000;
}

function exampleChannel() {
    return String(reactionCfg().channelUrl || reactionCfg().channelJid || '').trim();
}

// ── parsing ──────────────────────────────────────────────────────────

/**
 * Pull the invite code + post id out of whatever the user typed.
 * @returns {{invite:string, postId:string, url:string} | {error:'empty'|'invalid'|'no-post-id'}}
 */
function parseTarget(raw) {
    const text = String(raw || '').trim();
    if (!text) return { error: 'empty' };

    const post = text.match(CHANNEL_POST_RE);
    if (post) {
        return { invite: post[1], postId: post[2], url: buildTargetUrl(post[1], post[2]) };
    }

    const bare = text.match(BARE_RE);
    if (bare) {
        return { invite: bare[1], postId: bare[2], url: buildTargetUrl(bare[1], bare[2]) };
    }

    const base = text.match(CHANNEL_BASE_RE);
    if (base) return { invite: base[1], postId: '', url: buildTargetUrl(base[1], '') };

    return { error: 'invalid' };
}

/** Canonical post URL used for the API call *and* the View button. */
function buildTargetUrl(invite, postId) {
    const cleanInvite = String(invite || '').trim();
    const cleanId = String(postId || '').trim();
    if (!cleanInvite) return '';
    return cleanId
        ? `https://whatsapp.com/channel/${cleanInvite}/${cleanId}`
        : `https://whatsapp.com/channel/${cleanInvite}`;
}

/**
 * Extract every emoji the user actually typed (URLs stripped first), plus any
 * recognised `fire` / `heart` style words. Returns [] when there is none —
 * callers must treat that as "no emoji supplied", never as "use a default".
 */
function collectEmojis(raw) {
    const text = String(raw || '').replace(/https?:\/\/\S+/gi, ' ');
    const found = [];
    for (const match of text.match(EMOJI_RE) || []) {
        if (match && !found.includes(match)) found.push(match);
    }
    if (!found.length) {
        for (const word of text.toLowerCase().split(/[^a-z]+/)) {
            const mapped = EMOJI_ALIASES.get(word);
            if (mapped && !found.includes(mapped)) found.push(mapped);
        }
    }
    return found.slice(0, 3);
}

/** Join + clamp to what the endpoint will accept. */
function emojiString(emojis) {
    return (Array.isArray(emojis) ? emojis.join('') : String(emojis || '')).slice(0, MAX_EMOJI_LEN);
}

/** Walk the message tree looking for forwarded channel metadata. */
function findForwardedChannel(msg) {
    const seen = new Set();
    const walk = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 6 || seen.has(node)) return null;
        seen.add(node);
        const info = node.forwardedNewsletterMessageInfo;
        if (info && (info.newsletterJid || info.newsletterName)) {
            return {
                newsletterJid: String(info.newsletterJid || ''),
                serverMessageId: String(info.serverMessageId || ''),
                newsletterName: String(info.newsletterName || ''),
            };
        }
        for (const value of Object.values(node)) {
            const found = walk(value, depth + 1);
            if (found) return found;
        }
        return null;
    };
    return walk(msg?.message || msg);
}

/** Turn a replied-to forwarded channel post into a channel post URL. */
async function resolveFromForward(sock, msg) {
    const forwarded = findForwardedChannel(msg);
    if (!forwarded || !forwarded.newsletterJid || !forwarded.serverMessageId) return null;
    if (typeof sock.newsletterMetadata !== 'function') return null;

    let invite = '';
    try {
        const meta = await sock.newsletterMetadata('jid', forwarded.newsletterJid);
        invite = String(meta?.invite || meta?.preview?.invite || '').trim();
    } catch (_) { /* caller reports the miss */ }

    if (!invite) return null;
    return {
        invite,
        postId: forwarded.serverMessageId,
        url: buildTargetUrl(invite, forwarded.serverMessageId),
        channelName: forwarded.newsletterName,
    };
}

async function resolveQuotedPost(sock, msg) {
    const resolved = await resolveFromForward(sock, msg).catch(() => null);
    if (!resolved) return null;
    return { ...resolved, url: resolved.url || buildTargetUrl(resolved.invite, resolved.postId) };
}

// ── HTTP layer ───────────────────────────────────────────────────────

class RchError extends Error {
    constructor(code, message, hint = '') {
        super(message);
        this.name = 'RchError';
        this.code = code;
        this.hint = hint;
    }
}

/** Build `?action=react&url=…&emoji=…` with each key appearing exactly once. */
function buildQuery(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value));
    }
    return search.toString();
}

const textOf = (body) => {
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object') {
        return String(body.error || body.message || body?.data?.message || '') || JSON.stringify(body).slice(0, 300);
    }
    return '';
};

/** Turn any non-success answer into an actionable, classified error. */
function classifyFailure(status, body, requestUrl) {
    const raw = typeof body === 'string' ? body : '';
    const text = textOf(body);
    const lower = text.toLowerCase();

    if (raw.trim().startsWith('<') || /<(?:!doctype|html)/i.test(raw.slice(0, 200))) {
        return new RchError(
            'not-found',
            `The endpoint returned an HTML 404 page (HTTP ${status}) instead of JSON.`,
            `The route must be /api/Fun/Rch — check RCH_API_BASE. Tried: ${requestUrl.split('?')[0]}`
        );
    }
    if (/unknown action/i.test(text) || /array/i.test(lower)) {
        return new RchError(
            'bad-action',
            'The endpoint rejected `action` — it received something other than react | sync | keys.',
            'This happens when the base URL already carries a query string, so `action` is sent twice. '
            + 'Clear RCH_API_BASE down to https://api.omegatech.app/api/Fun/Rch (no ?action=…).'
        );
    }
    if (/emoji is required/i.test(text)) {
        return new RchError('emoji-missing', 'The endpoint requires an emoji.', 'Add one: .rch <link> 🔥');
    }
    if (/url is required/i.test(text)) {
        return new RchError('url-missing', 'The endpoint received no channel post URL.', 'Send the full post link, post number included.');
    }
    if (/limit harian|kuota|quota|limit.*api/i.test(text)) {
        return new RchError(
            'quota',
            text || 'Daily reaction quota exhausted.',
            'The API key used by Omegatech hit its daily cap. It resets tomorrow — nothing to fix in the bot.'
        );
    }
    if (/sibuk|busy|timeout|timed out/i.test(text)) {
        return new RchError('busy', text || 'The reaction service is busy right now.', 'Retry in a few minutes.');
    }
    if (/invalid.*(url|link)|link.*(tidak|not).*(valid|found)/i.test(text)) {
        return new RchError('bad-link', text || 'That channel post link could not be resolved.', 'Open the post in WhatsApp and copy the link again.');
    }
    if (status >= 500) {
        return new RchError('server', text || `The reaction service answered HTTP ${status}.`, 'Retry shortly.');
    }
    return new RchError('failed', text || `The reaction service answered HTTP ${status || 0}.`, '');
}

/**
 * POST/GET the reaction. Body decides success — the endpoint sometimes pairs a
 * success payload with a 5xx status, so `validateStatus` is disabled.
 */
async function callReaction(targetUrl, emoji, opts = {}) {
    const axios = require('axios');
    const base = apiBase();
    const query = buildQuery({ action: 'react', url: targetUrl, emoji });
    const requestUrl = `${base}?${query}`;
    const retries = Number.isFinite(opts.retries) ? opts.retries : 1;

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const startedAt = Date.now();
        let response;
        try {
            response = await axios.get(requestUrl, {
                timeout: timeoutMs(),
                maxContentLength: 1024 * 512,
                validateStatus: () => true,
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'SukunaMD/3.0 (channel-reaction)',
                },
            });
        } catch (networkError) {
            const ms = Date.now() - startedAt;
            ui.err(TAG, 'network error', `${networkError?.code || 'ERR'} · ${ms}ms`);
            lastError = new RchError(
                'network',
                `Could not reach api.omegatech.app (${networkError?.code || networkError?.message || 'request failed'}).`,
                'Check the panel container’s outbound network / DNS.'
            );
            if (attempt < retries) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue; }
            throw lastError;
        }

        const ms = Date.now() - startedAt;
        const body = response.data;
        const success = response.status >= 200 && response.status < 300 && body
            && typeof body === 'object' && body.success === true;

        if (success) {
            const payload = (body.data && typeof body.data === 'object') ? body.data : body;
            ui.api(TAG, `react ${emoji}`, `HTTP ${response.status} · ${ms}ms · task ${payload?.task_id || 'n/a'}`);
            return { ok: true, payload, status: response.status, ms, requestUrl, base };
        }

        const failure = classifyFailure(response.status, body, requestUrl);
        ui.warn(TAG, `react rejected (${failure.code})`, `HTTP ${response.status} · ${ms}ms · ${failure.message.slice(0, 90)}`);

        // Busy / 5xx / 429 are worth one retry; quota and 4xx are not.
        const retryable = failure.code === 'busy' || failure.code === 'server'
            || response.status === 429 || response.status === 502 || response.status === 503;
        lastError = failure;
        if (attempt < retries && retryable) {
            await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
            continue;
        }
        throw failure;
    }

    throw lastError || new RchError('failed', 'The reaction request failed.', '');
}

// ── WhatsApp output ──────────────────────────────────────────────────

const LINE = '━━━━━━━━━━━━━━━━━━';

function usageCard(prefix, command) {
    const example = exampleChannel();
    const sample = example ? `${example}/218 🔥` : '<channel post link> 🔥';
    return [
        `┏━◇ *SUKUNA MD* ◇ ${LINE.slice(0, 3)}`,
        '┃ 📢 *CHANNEL REACTION*',
        `┃`,
        `┃ ▸ *Usage*`,
        `┃   ${prefix}${command} ${sample}`,
        `┃`,
        `┃ ▸ *Examples*`,
        `┃   ${prefix}${command} ${example || '<link>'} 🔥`,
        `┃   ${prefix}${command} ${example || '<link>'} ❤️`,
        `┃`,
        `┃ 💬 Or reply to a forwarded channel post:`,
        `┃   ${prefix}${command} 🔥`,
        `┃`,
        `┃ ⚠️ An emoji is required — no default is applied.`,
        `┗─ Sukuna MD`,
    ].join('\n');
}

function successText(target, payload, emoji) {
    const usage = Number(payload?.usage_today || 0);
    const limit = Number(payload?.limit || 0);
    const points = Number(payload?.points_remaining || 0);
    return [
        '┏━◇ *SUKUNA MD* ◇ ━━━',
        '┃ ✅ *CHANNEL UPDATE REACTED*',
        '┃',
        `┃ 📢 *Update*`,
        `┃   ${target.url}`,
        `┃`,
        `┃ ${emoji} *Emoji*   ${payload?.emojis || emoji}`,
        `┃ ⏱️ *Time*    ${payload?.time || 'queued'}`,
        `┃ 📝 *Status*  ${payload?.message || 'Reaction queued'}`,
        `┃ 📋 *Task*    ${payload?.task_id || 'N/A'}`,
        limit ? `┃ 📊 *Today*   ${usage}/${limit}` : '',
        points ? `┃ 💎 *Points*  ${points.toLocaleString()}` : '',
        '┗─ Sukuna MD',
    ].filter(Boolean).join('\n');
}

function failureText(error) {
    const map = {
        'emoji-missing': ['🚫 *EMOJI REQUIRED*', 'Send an emoji after the link, e.g. `.rch <link> 🔥`.'],
        'url-missing': ['🚫 *LINK MISSING*', 'Send the channel post link, post number included.'],
        'bad-link': ['🚫 *LINK NOT RECOGNISED*', 'Open the post in WhatsApp → Share → Copy link, then send it again.'],
        'not-found': ['🚫 *ENDPOINT NOT FOUND*', 'The reaction service URL is wrong (missing `/api`). Check `RCH_API_BASE`.'],
        'bad-action': ['🚫 *ENDPOINT REJECTED ACTION*', '`RCH_API_BASE` carries a query string, so `action` is duplicated. Set it to `https://api.omegatech.app/api/Fun/Rch`.'],
        quota: ['⛔ *DAILY QUOTA EXHAUSTED*', 'The Omegatech API key finished its 50 reactions for today. Resets tomorrow.'],
        busy: ['🕒 *SERVICE BUSY*', 'Omegatech is overloaded right now. Try again in a minute.'],
        server: ['⚠️ *SERVICE ERROR*', 'The reaction service answered with a server error. Try again shortly.'],
        network: ['📡 *NETWORK FAILURE*', 'This panel could not reach `api.omegatech.app`. Check container networking.'],
        failed: ['❌ *REACTION FAILED*', 'The service refused the request.'],
    };
    const [title, advice] = map[error?.code] || map.failed;
    return [
        '┏━◇ *SUKUNA MD* ◇ ━━━',
        `┃ ${title}`,
        '┃',
        `┃ ▸ ${String(error?.message || 'Unknown error').slice(0, 300)}`,
        error?.hint ? `┃ ▸ _${String(error.hint).slice(0, 300)}_` : '',
        `┃ ▸ ${advice}`,
        '┗─ Sukuna MD',
    ].filter(Boolean).join('\n');
}

/** Rich card with View / Copy / React-again buttons; false when the relay fails. */
async function sendUpdateCard({ sock, msg, from, target, payload, emoji, prefix, command }) {
    const baileys = require('@pasqua-dev/baileys');
    const { generateWAMessageFromContent, proto } = baileys;

    const buttons = [
        {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
                display_text: '📢 View Channel Update',
                url: target.url,
                merchant_url: target.url,
                webview_interaction: false,
            }),
        },
        {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: '📋 Copy Update Link',
                copy_code: target.url,
            }),
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: `${emoji} React Again`,
                id: `${prefix}${command} ${target.url} ${emoji}`.trim(),
            }),
        },
    ];

    const body = successText(target, payload, emoji).replace(/┏━◇ \*SUKUNA MD\* ◇ ━━━\n/, '');

    const interactive = {
        body: { text: body },
        footer: { text: 'SUKUNA MD · channel reaction' },
        header: { title: '✦ CHANNEL REACTION ✦', hasMediaAttachment: false },
        nativeFlowMessage: { buttons, messageParamsJson: '' },
    };

    const wrapped = generateWAMessageFromContent(from, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactive),
            },
        },
    }, { userJid: sock.user?.id, ...(msg?.message ? { quoted: msg } : {}) });

    await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
    return true;
}

// ── command ──────────────────────────────────────────────────────────

module.exports = {
    name: 'rch',
    // A bare `react` alias is deliberately NOT used — it collides with the
    // bot's own status-reaction helpers.
    aliases: ['reactch', 'chreact', 'channelreact'],
    description: 'React to a WhatsApp channel update (owner + mods only)',
    usage: '.rch <channel post link> <emoji>',
    category: 'fun',
    ownerOnly: true,

    async execute(ctx) {
        const {
            sock, msg, from, reply,
            args = [], text, prefix = '.', command = 'rch',
            isOwner, isMod,
        } = ctx || {};

        const fromMe = msg?.key?.fromMe === true;
        const allowed = fromMe || isOwner === true || isMod === true;

        // ── 1. permission gate ─────────────────────────────────────────
        if (!allowed) {
            ui.warn(TAG, 'access denied', 'owner / .setmod only');
            return reply(
                '🔒 *Restricted command.*\n\n'
                + 'Only the *bot account* and users granted with `.setmod` '
                + 'can react to channel updates.'
            );
        }

        let raw = Array.isArray(args) ? args.join(' ').trim() : '';
        if (!raw) raw = String(text || '').trim();

        // ── 2. resolve the target post ─────────────────────────────────
        let target = null;
        const withoutUrls = raw.replace(/https?:\/\/\S+/gi, ' ').trim();

        if (raw) {
            const parsed = parseTarget(raw);
            if (parsed.error === 'invalid') {
                ui.warn(TAG, 'invalid target', raw.slice(0, 60));
                return reply(
                    '❌ *That is not a channel post link.*\n\n'
                    + `Send it like this:\n\`${prefix}${command} ${exampleChannel() || '<channel post link>'}/218 🔥\``,
                    { raw: true }
                );
            }
            if (parsed.error === 'empty') return reply(usageCard(prefix, command), { raw: true });
            if (!parsed.postId) {
                const upgraded = await resolveQuotedPost(sock, msg);
                if (upgraded) {
                    target = upgraded;
                } else {
                    return reply(
                        '📌 *Post id missing.*\n\n'
                        + 'A channel update link ends with the post number, e.g.\n'
                        + `\`${exampleChannel() || '<channel>'}/218\`\n\n`
                        + `Or reply to the forwarded channel update with \`${prefix}${command} 🔥\`.`,
                        { raw: true }
                    );
                }
            } else {
                target = { ...parsed, channelName: '' };
            }
        } else {
            target = await resolveQuotedPost(sock, msg);
            if (!target) return reply(usageCard(prefix, command), { raw: true });
        }

        if (!target || !target.url) return reply(usageCard(prefix, command), { raw: true });

        // ── 3. emoji is mandatory — never substitute one ───────────────
        const emojis = collectEmojis(withoutUrls || raw);
        if (!emojis.length) {
            ui.warn(TAG, 'no emoji supplied', 'request refused before any API call');
            return reply(
                '🚫 *Emoji required.*\n\n'
                + `\`${prefix}${command} ${target.url} 🔥\`\n\n`
                + '_The reaction API needs the emoji you want to place — '
                + 'the bot does not pick one for you._'
            );
        }
        const emoji = emojiString(emojis);

        // ── 4. trace + progress ────────────────────────────────────────
        ui.card({
            title: '◆ CHANNEL REACTION REQUEST',
            rows: [
                { label: 'CHANNEL', value: target.invite || '—', tone: ui.C.white },
                { label: 'POST', value: target.postId || '—', tone: ui.C.gold },
                { label: 'EMOJI', value: emoji, tone: ui.C.accent },
                { label: 'USER', value: String(from || '').replace(/\D/g, '').slice(-12) || 'me', tone: ui.C.dim },
                { divider: true },
                { label: 'ENDPOINT', value: apiBase(), tone: ui.C.sky },
                { free: 'auto-join skipped · pairing-time only', tone: ui.C.dim },
            ],
        });

        try { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }); } catch (_) { /* cosmetic */ }

        await reply(
            `┏━◇ *SUKUNA MD* ◇ ━━━\n`
            + `┃ 🔄 *Reacting to the channel update...*\n┃\n`
            + `┃ 🔗 ${target.url}\n`
            + `┃ ${emoji} ${emoji}\n┃\n`
            + `┃ _This usually takes 8–15 seconds._\n`
            + `┗─ Sukuna MD`,
            { raw: true }
        );

        // ── 5. call the API ────────────────────────────────────────────
        let result;
        try {
            result = await callReaction(target.url, emoji);
        } catch (error) {
            ui.err(TAG, `reaction failed · ${error?.code || 'unknown'}`, String(error?.message || '').slice(0, 80));
            try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch (_) { /* cosmetic */ }
            return reply(failureText(error), { raw: true });
        }

        // ── 6. result card ─────────────────────────────────────────────
        const { payload, status, ms } = result;
        ui.card({
            title: '✔ CHANNEL REACTION SENT',
            rows: [
                { label: 'POST', value: target.url, tone: ui.C.sky },
                { label: 'EMOJI', value: payload?.emojis || emoji, tone: ui.C.accent },
                { label: 'HTTP', value: `${status} · success`, tone: ui.C.ok },
                { label: 'LATENCY', value: `${ms} ms`, tone: ui.C.white },
                { label: 'TASK', value: payload?.task_id || 'n/a', tone: ui.C.gold },
                {
                    label: 'USAGE',
                    value: Number(payload?.limit || 0)
                        ? `${Number(payload.usage_today || 0)}/${payload.limit}`
                        : 'n/a',
                    tone: ui.C.dim,
                },
            ],
            footer: String(payload?.message || 'Reaction queued'),
        });

        let cardSent = false;
        try {
            cardSent = await sendUpdateCard({ sock, msg, from, target, payload, emoji, prefix, command });
        } catch (error) {
            ui.warn(TAG, 'rich card unavailable', String(error?.message || '').slice(0, 60));
        }

        if (!cardSent) await reply(successText(target, payload, emoji), { raw: true });

        try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }); } catch (_) { /* cosmetic */ }
        return true;
    },

    _private: {
        parseTarget,
        collectEmojis,
        emojiString,
        buildTargetUrl,
        findForwardedChannel,
        resolveFromForward,
        callReaction,
        buildQuery,
        normalizeApiBase,
        classifyFailure,
        apiBase,
        successText,
        failureText,
        usageCard,
        RchError,
        EMOJI_ALIASES,
    },
};

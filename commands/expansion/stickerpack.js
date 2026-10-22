/**
 * .stickerpack <search> — turn a Pinterest image search into ONE native
 * WhatsApp sticker pack (up to 40 stickers).
 *
 * Usage:
 *   .stickerpack Billie Eilish
 *   .stickerpack BMW
 *   .stickerpack sneakers
 *
 * How it works:
 *   1. Collects image candidates from Pinterest:
 *        a. the official Pinterest API v5 using the token set below
 *           (skipped automatically for 30 min if Pinterest rejects it),
 *        b. the same Prexzy search .pint uses (commands/general/pint.js),
 *           re-queried with a few extra keywords when one search does not
 *           return enough pictures.
 *   2. Downloads them (pinimg thumbnails are upgraded to the 736px version,
 *      with automatic fallback to the original link).
 *   3. Turns each picture into a true square 512x512 sticker: smart-cropped
 *      to fill the whole square (no thin letterboxed strip) with rounded
 *      corners, kept under ~100 KB.
 *   4. Sends everything as a single sticker-pack message, the same way
 *      .tgsticker does (sock.sendMessage with `stickers` + `cover`).
 *
 * ENV (optional): PINTEREST_ACCESS_TOKEN overrides the built-in token.
 * DEPENDENCIES (already in package.json): sharp
 */
'use strict';

const sharp  = require('sharp');
const crypto = require('crypto');
const { brandSticker, DEFAULT_PACK_NAME, DEFAULT_PUBLISHER } = require('../../utils/stickerMetadata');

const MAX_STICKERS     = 40;         // hard cap — never more than 40 in a pack
const CANDIDATE_TARGET = 90;         // stop widening the search once we have this many links
const CANDIDATE_MAX    = 120;        // absolute ceiling on links to consider
const CONCURRENCY      = 5;          // parallel download + convert workers
const DEADLINE_MS      = 120_000;    // stop pulling new images after this long
const COOLDOWN_MS      = 60_000;     // per user + chat
const MIN_SIDE_PX      = 100;        // skip thumbnails / avatars
const MAX_ASPECT       = 2.5;        // skip extreme banners / long infographics
const STICKER_SIZE     = 512;        // WhatsApp sticker canvas
const CORNER_RADIUS    = 72;         // rounded-square look; set 0 for sharp corners
const TARGET_BYTES     = 100 * 1024; // WhatsApp static-sticker size target
const QUALITY_STEPS    = [80, 65, 50, 35, 25];
const PACK_PUBLISHER   = DEFAULT_PUBLISHER;
const PACK_BRAND       = DEFAULT_PACK_NAME;
const SEARCH_VARIANTS  = ['aesthetic', 'wallpaper', 'hd photo', 'pictures'];
const PINTEREST_API    = 'https://api.pinterest.com/v5';
// Built-in Pinterest token; PINTEREST_ACCESS_TOKEN in the environment overrides it.
const PINTEREST_TOKEN  = process.env.PINTEREST_ACCESS_TOKEN || 'pina_AMA7XHYYADQA6CIAGBALYDZD3HC37IABACGSPFACWMD6SMHAWXQPXOYLAJGLEYIPOA43LWASQX55TABFTXA5U6CYZQL6GLIA';

const cooldowns = new Map();
let officialPausedUntil = 0;

const ROUND_MASK = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STICKER_SIZE}" height="${STICKER_SIZE}">` +
    `<rect width="${STICKER_SIZE}" height="${STICKER_SIZE}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="#fff"/></svg>`
);

function trimCooldowns() {
    const now = Date.now();
    for (const [key, expires] of cooldowns) if (expires <= now) cooldowns.delete(key);
}

function titleCase(text) {
    return String(text).replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1));
}

function truncate(text, max) {
    const str = String(text);
    return str.length > max ? `${str.slice(0, max - 1).trimEnd()}…` : str;
}

/**
 * Reuse the .pint provider so both commands hit the same working Prexzy
 * endpoint. Required lazily so it always picks up the loaded copy.
 */
function getPintProvider() {
    const provider = require('../general/pint')._private;
    if (!provider || typeof provider.findImages !== 'function' || typeof provider.fetchImage !== 'function') {
        throw new Error('pint provider is not available');
    }
    return provider;
}

// ── Link helpers ──────────────────────────────────────────────────────────

/** Same Pinterest picture at different sizes shares one filename hash. */
function imageKey(url) {
    try {
        const u = new URL(url);
        if (/(^|\.)pinimg\.com$/i.test(u.hostname)) {
            const last = u.pathname.split('/').pop() || '';
            return `pin:${last.replace(/\.[a-z0-9]+$/i, '').toLowerCase()}`;
        }
        return `${u.hostname}${u.pathname}`.toLowerCase();
    } catch {
        return String(url);
    }
}

/** i.pinimg.com/236x/... (or /originals/...) → the sharper 736px version. */
function upgradeUrl(url) {
    try {
        const u = new URL(url);
        if (!/(^|\.)pinimg\.com$/i.test(u.hostname)) return url;
        const path = u.pathname.replace(/^\/(?:\d+x\d*|originals)\//i, '/736x/');
        if (path === u.pathname) return url;
        u.pathname = path;
        return u.toString();
    } catch {
        return url;
    }
}

// ── Official Pinterest API v5 (optional) ──────────────────────────────────

function pickOfficialImage(item) {
    const images = item?.media?.images;
    if (!images || typeof images !== 'object') return null;
    const sizes = Object.values(images)
        .filter(img => img && typeof img.url === 'string')
        .sort((a, b) => (a.width || 0) - (b.width || 0));
    if (!sizes.length) return null;
    // Smallest version that is still big enough for a 512px sticker.
    return (sizes.find(img => (img.width || 0) >= 600) || sizes[sizes.length - 1]).url;
}

/**
 * Pinterest keyword search. Only runs when PINTEREST_ACCESS_TOKEN is set.
 * Pinterest limits keyword search to approved apps, so if the token is
 * rejected this switches itself off for 30 minutes and the Prexzy search
 * carries on alone. The token is never logged.
 */
async function searchOfficialPinterest(query, want) {
    const token = String(PINTEREST_TOKEN || '').trim();
    if (!token || Date.now() < officialPausedUntil) return [];

    const urls = [];
    let bookmark = '';
    for (let page = 0; page < 3 && urls.length < want; page++) {
        const params = new URLSearchParams({ query, country_code: 'US', locale: 'en-US' });
        if (bookmark) params.set('bookmark', bookmark);

        const response = await fetch(`${PINTEREST_API}/search/partner/pins?${params}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            const detail = (await response.text().catch(() => '')).slice(0, 200);
            if ([400, 401, 403, 404].includes(response.status)) {
                officialPausedUntil = Date.now() + 30 * 60_000;
                console.error(`[stickerpack] Pinterest API rejected the search (HTTP ${response.status}) ${detail} — using Prexzy search only for 30 min`);
            } else {
                console.error(`[stickerpack] Pinterest API HTTP ${response.status}`);
            }
            return urls;
        }
        const payload = await response.json();
        for (const item of payload?.items || []) {
            const url = pickOfficialImage(item);
            if (url) urls.push(url);
        }
        bookmark = payload?.bookmark || '';
        if (!bookmark) break;
    }
    return urls;
}

// ── Candidate collection ──────────────────────────────────────────────────

/**
 * Official API first, then the .pint search, then keyword variants of the
 * search until there are enough links to build a full pack even after dead
 * or unusable images are dropped. Order = relevance order.
 */
async function gatherCandidates(query, provider) {
    const list = [];
    const seen = new Set();
    let firstError = null;

    const add = url => {
        const key = imageKey(url);
        if (seen.has(key) || list.length >= CANDIDATE_MAX) return;
        seen.add(key);
        list.push({ url, upgraded: upgradeUrl(url) });
    };

    try {
        (await searchOfficialPinterest(query, CANDIDATE_TARGET)).forEach(add);
    } catch (error) {
        console.error('[stickerpack:official]', error?.message || error);
    }

    try {
        (await provider.findImages(query, CANDIDATE_MAX)).forEach(item => add(item.url));
    } catch (error) {
        firstError = error;
        console.error('[stickerpack:search]', error?.message || error);
    }

    if (list.length < CANDIDATE_TARGET) {
        const settled = await Promise.allSettled(
            SEARCH_VARIANTS.map(word => provider.findImages(`${query} ${word}`, CANDIDATE_MAX))
        );
        for (const result of settled) {
            if (result.status === 'fulfilled') result.value.forEach(item => add(item.url));
        }
    }

    if (!list.length && firstError) throw firstError;
    return list;
}

// ── Sticker conversion ────────────────────────────────────────────────────

/**
 * Any image buffer → 512x512 static WebP sticker (null if unusable).
 * The picture is smart-cropped to FILL the square (so it no longer shows up
 * as a tall strip with empty sides) and given rounded corners.
 */
async function toStickerWebp(buffer) {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    const { width, height } = meta;
    if (!width || !height) return null;
    if (Math.min(width, height) < MIN_SIDE_PX) return null;
    if (Math.max(width, height) / Math.min(width, height) > MAX_ASPECT) return null;

    const { data, info } = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'cover', position: sharp.strategy.attention })
        .composite([{ input: ROUND_MASK, blend: 'dest-in' }])
        .raw()
        .toBuffer({ resolveWithObject: true });

    let out = null;
    for (const quality of QUALITY_STEPS) {
        out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
            .webp({ quality, effort: 4 })
            .toBuffer();
        if (out.length <= TARGET_BYTES) break;
    }
    if (!out || out.length < 1024 || out.length > 1024 * 1024) return null;
    return out;
}

async function fetchWithFallback(candidate, fetchImage) {
    const links = candidate.upgraded && candidate.upgraded !== candidate.url
        ? [candidate.upgraded, candidate.url]
        : [candidate.url];
    let lastError;
    for (const link of links) {
        try {
            return await fetchImage(link);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

/**
 * Download + convert candidates with a small worker pool. Stops as soon as
 * MAX_STICKERS good stickers exist, and keeps the original search order.
 */
async function buildStickers(candidates, fetchImage) {
    const found = [];
    const seen = new Set();
    const deadline = Date.now() + DEADLINE_MS;
    let cursor = 0;
    let failed = 0;

    async function worker() {
        while (found.length < MAX_STICKERS && cursor < candidates.length && Date.now() < deadline) {
            const index = cursor++;
            try {
                const raw = await fetchWithFallback(candidates[index], fetchImage);
                const data = await toStickerWebp(raw);
                if (!data) { failed++; continue; }
                const hash = crypto.createHash('sha1').update(data).digest('hex');
                if (seen.has(hash)) continue; // same picture served twice
                seen.add(hash);
                found.push({ index, data });
            } catch (error) {
                failed++;
                console.error('[stickerpack:image]', error?.message || error);
            }
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    found.sort((a, b) => a.index - b.index);
    return { items: found.slice(0, MAX_STICKERS), failed };
}

module.exports = {
    name: 'stickerpack',
    aliases: ['stickerpacks', 'pinpack', 'pinsticker'],
    description: `Search Pinterest and send the results as one WhatsApp sticker pack (up to ${MAX_STICKERS})`,
    usage: '.stickerpack Billie Eilish | .stickerpack BMW | .stickerpack sneakers',
    category: 'expansion',

    async execute({ sock, msg, from, sender, args, reply }) {
        trimCooldowns();
        const query = String((args || []).join(' ')).trim().replace(/\s+/g, ' ');
        if (!query) {
            return reply(
                `🧩 Usage: *.stickerpack Billie Eilish*\n` +
                `Builds one sticker pack (up to ${MAX_STICKERS} stickers) from Pinterest images.`
            );
        }
        if (query.length > 60) return reply('❌ Keep the sticker pack search under 60 characters.');

        const key = `${from || 'chat'}:${sender || 'user'}`;
        const expires = cooldowns.get(key) || 0;
        if (expires > Date.now()) {
            return reply(`⏳ Please wait *${Math.ceil((expires - Date.now()) / 1000)}s* before using .stickerpack again.`);
        }
        cooldowns.set(key, Date.now() + COOLDOWN_MS);

        try {
            const provider = getPintProvider();

            await reply(`🔎 Building a sticker pack for *${query}*... this can take up to a minute.`);

            const candidates = await gatherCandidates(query, provider);
            if (!candidates.length) {
                cooldowns.delete(key);
                return reply(`❌ No images found for *${query}*. Try a broader search.`);
            }

            const { items, failed } = await buildStickers(candidates, provider.fetchImage);
            console.log(`[stickerpack] "${query}": ${candidates.length} candidates → ${items.length} stickers (${failed} unusable)`);
            if (!items.length) {
                cooldowns.delete(key);
                return reply('❌ None of the images could be turned into stickers. Try another search.');
            }

            const stickers = [];
            for (let i = 0; i < items.length; i += 1) {
                const item = items[i];
                stickers.push({
                    data: await brandSticker(item.data),
                    isAnimated: false,
                    emojis: ['📌'],
                    accessibilityLabel: truncate(`${query} sticker ${i + 1}`, 80),
                });
            }
            const cover = stickers[0].data; // static 512x512 WebP tray icon
            const packName = `${truncate(titleCase(query), 40)} · ${PACK_BRAND}`;

            // One native StickerPackMessage — same call .tgsticker makes.
            await sock.sendMessage(from, {
                stickers,
                cover,
                name: packName,
                publisher: PACK_PUBLISHER,
                description: `Pinterest search: ${query}`,
            }, { quoted: msg });

            let summary = `✅ *${packName}*\n` +
                `Source: Pinterest — *${query}*\n` +
                `Packed: ${stickers.length}/${MAX_STICKERS} stickers`;
            if (stickers.length < MAX_STICKERS) summary += `\n\n_Only ${stickers.length} usable images were found for this search._`;
            if (failed) summary += `\n⚠️ Skipped ${failed} unusable image${failed === 1 ? '' : 's'}`;
            return reply(summary);
        } catch (error) {
            cooldowns.delete(key);
            console.error('[stickerpack]', error);
            return reply('❌ Sticker pack creation failed. Please try again shortly.');
        }
    },

    _private: { toStickerWebp, buildStickers, gatherCandidates, upgradeUrl, imageKey, pickOfficialImage, searchOfficialPinterest, cooldowns },
};

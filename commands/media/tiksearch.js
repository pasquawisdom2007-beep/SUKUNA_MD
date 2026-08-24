/**
 * TikSearch Command — Search TikTok and send the video
 * Usage: .tiksearch <query>
 *
 * Robust pipeline:
 *   1. Search across multiple providers until one returns hits.
 *      - prexzyapis.com                         (the configured key-free provider)
 *      - tiktokapi.store /api/v1/search/video  (keyed, optional)
 *      - tikwm.com /api/feed/search             (POST, Cloudflare-walled —
 *        falls back to a headless-browser solve)
 *      - delirius-apiofc.vercel.app             (legacy fallback)
 *      - TikTok web search via a headless browser
 *   2. For up to 8 hits, try each candidate URL (hdplay > play > wmplay).
 *   3. For each URL, retry up to 2x with backoff and browser headers.
 *   4. If every direct URL fails for a hit but we have the original tiktok
 *      page URL, re-resolve via `https://tikwm.com/api/?url=...&hd=1` and
 *      retry the fresh CDN URL it returns.
 *   5. 5-minute in-memory query cache.
 */
'use strict';

const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const tikwmBrowser = require('../../lib/tikwmBrowser');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

puppeteer.use(StealthPlugin());

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.tiktok.com/',
};

// Headers that mimic tikwm.com's OWN frontend calling its OWN API — this is
// the same request their website makes when a real person types a query into
// the search box at tikwm.com. Cloudflare rules on an API host are usually
// tuned to wave through same-origin AJAX calls from the site's own pages and
// hold up everything else, so matching that shape (Origin/Referer = tikwm.com
// itself, Sec-Fetch-* set the way a fetch()-from-page call sets them,
// X-Requested-With present) is the difference between "obvious bot" and
// "the site talking to itself" as far as that check is concerned. Not
// guaranteed — if tikwm is running a full JS/TLS challenge instead of a
// header check, nothing short of a real browser gets through.
const TIKWM_HEADERS = {
    'User-Agent': BROWSER_HEADERS['User-Agent'],
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.tikwm.com',
    'Referer': 'https://www.tikwm.com/',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Ch-Ua': '"Chromium";v="120", "Not_A Brand";v="8", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
};

const MIN_VIDEO_BYTES = 10 * 1024;       // < 10 KB => junk / error page
const MAX_CANDIDATES  = 8;
const URL_RETRIES     = 2;
const CACHE_TTL_MS    = 5 * 60 * 1000;
const BROWSER_SEARCH_ENABLED = process.env.TIKSEARCH_BROWSER !== '0';
const BROWSER_SEARCH_TIMEOUT_MS = 12_000;

const cache = new Map(); // query -> { ts, result }

// ─── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function rawItem(item) {
    let raw = item;
    for (let i = 0; i < 3; i += 1) {
        if (raw?.item && typeof raw.item === 'object' && !Array.isArray(raw.item)) {
            raw = raw.item;
            continue;
        }
        if (raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
            && (raw.data.video || raw.data.id || raw.data.video_url || raw.data.play || raw.data.hdplay)) {
            raw = raw.data;
            continue;
        }
        break;
    }
    return raw;
}

function pickUrls(item) {
    const raw = rawItem(item) || {};
    const video = raw.video || {};
    return [
        raw.hdplay, raw.hdPlay, raw.play, raw.play_url, raw.playUrl, raw.wmplay,
        raw.video_url, raw.videoUrl, raw.download_addr, raw.downloadAddr,
        raw.playAddr, raw.play_addr, raw.no_watermark, raw.noWatermark,
        raw.download, raw.url, video.playAddr, video.play_addr,
        video.downloadAddr, video.download_addr, video.playUrl,
        video.no_watermark, video.noWatermark, video.download, video.url,
    ].filter(u => typeof u === 'string' && /^https?:\/\//i.test(u));
}

function numeric(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function shapeItem(item) {
    const raw = rawItem(item);
    if (!raw) return null;
    const urls = [...new Set(pickUrls(raw))];
    const author = typeof raw.author === 'string' ? raw.author : raw.author || {};
    const stats = raw.stats || raw.statistics || {};
    const id = raw.id || raw.video_id || raw.videoId;
    if (!urls.length && !id) return null;
    return {
        urls,
        pageUrl: raw.share_url || raw.shareUrl || raw.webVideoUrl || raw.web_video_url
            || (id ? `https://www.tiktok.com/@${author.unique_id || author.uniqueId || 'user'}/video/${id}` : null),
        title: String(raw.title || raw.desc || raw.description || 'TikTok Video').slice(0, 100),
        author: String(author.nickname || author.unique_id || author.uniqueId || raw.author_name || 'Unknown'),
        duration: numeric(raw.duration || raw.video?.duration),
        plays: numeric(raw.play_count || raw.playCount || stats.playCount || stats.play_count),
        likes: numeric(raw.digg_count || raw.diggCount || stats.diggCount || stats.likes),
    };
}

function collectSearchItems(payload) {
    const found = [];
    const seen = new Set();
    const visit = (node, depth = 0) => {
        if (!node || depth > 7) return;
        if (Array.isArray(node)) {
            for (const entry of node) visit(entry, depth + 1);
            return;
        }
        if (typeof node !== 'object') return;
        if (node.item && typeof node.item === 'object' && (node.item.video || node.item.id || node.item.video_url || node.item.play || node.item.hdplay || node.item.playAddr)) {
            const candidate = shapeItem(node.item);
            if (candidate && !seen.has(candidate.pageUrl || candidate.urls[0])) {
                seen.add(candidate.pageUrl || candidate.urls[0]);
                found.push(node.item);
            }
        } else if (node.video || node.video_url || node.downloadAddr || node.playAddr || node.play || node.hdplay || node.wmplay || node.playUrl) {
            const candidate = shapeItem(node);
            if (candidate && !seen.has(candidate.pageUrl || candidate.urls[0])) {
                seen.add(candidate.pageUrl || candidate.urls[0]);
                found.push(node);
            }
        }
        for (const key of ['data', 'videos', 'items', 'itemList', 'list', 'results', 'videoList']) {
            if (node[key]) visit(node[key], depth + 1);
        }
    };
    visit(payload);
    return found;
}

// ─── search providers ────────────────────────────────────────────────────────

function logProviderFailure(name, res, err) {
    if (err) {
        console.error(`[tiksearch] ${name} threw: ${err.code || ''} ${err.message}`);
        return;
    }
    const bodyPreview = typeof res.data === 'string'
        ? res.data.slice(0, 200)
        : JSON.stringify(res.data)?.slice(0, 200);
    console.error(`[tiksearch] ${name} returned no usable array — status ${res.status}, body: ${bodyPreview}`);
}

async function searchTikTokApiStore(query) {
    const key = process.env.TIKTOKAPI_STORE_KEY;
    if (!key) {
        console.error('[tiksearch] TIKTOKAPI_STORE_KEY is not set in .env — skipping this provider');
        return [];
    }
    try {
        const res = await axios.get('https://tiktokapi.store/api/v1/search/video', {
            params: { search_term: query, count: 12 },
            timeout: 20000,
            validateStatus: () => true,
            headers: { 'Authorization': `Bearer ${key}` },
        });
        if (res.status === 401) { console.error('[tiksearch] tiktokapi.store: invalid/missing API key'); return []; }
        if (res.status === 429) { console.error('[tiksearch] tiktokapi.store: per-minute rate limit hit'); return []; }
        if (res.status === 402) { console.error('[tiksearch] tiktokapi.store: daily/monthly quota exhausted'); return []; }
        const arr = Array.isArray(res.data?.data?.videos)
            ? res.data.data.videos
            : collectSearchItems(res.data);
        if (!Array.isArray(arr) || !arr.length) { logProviderFailure('tiktokapi.store', res); return []; }
        return arr;
    } catch (err) { logProviderFailure('tiktokapi.store', null, err); return []; }
}

async function searchPrexzy(query) {
    try {
        const res = await axios.get('https://prexzyapis.com/search/tiktoksearch', {
            params: { q: query },
            timeout: 30000,
            validateStatus: () => true,
            headers: { ...BROWSER_HEADERS, Accept: 'application/json, text/plain, */*' },
        });
        const payload = res.data;
        const upstreamError = payload?.data && !Array.isArray(payload.data)
            && typeof payload.data.message === 'string'
            && /failed|error|403|forbidden/i.test(payload.data.message);
        if (upstreamError) {
            console.error(`[tiksearch] prexzyapis upstream search failed: ${payload.data.message}`);
            return [];
        }
        const arr = Array.isArray(payload?.data?.videos) ? payload.data.videos
            : Array.isArray(payload?.data?.results) ? payload.data.results
            : Array.isArray(payload?.data) ? payload.data
            : collectSearchItems(payload);
        if (!Array.isArray(arr) || !arr.length) { logProviderFailure('prexzyapis', res); return []; }
        return arr;
    } catch (err) { logProviderFailure('prexzyapis', null, err); return []; }
}

function prexzyDownloadUrls(payload) {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    const groups = [data?.video_downloads, data?.videos, data?.downloads];
    const urls = [];
    for (const group of groups) {
        if (!Array.isArray(group)) continue;
        for (const item of group) {
            const url = typeof item === 'string' ? item : item?.url || item?.download_url || item?.downloadUrl;
            if (typeof url === 'string' && /^https?:\/\//i.test(url)) urls.push({ url, quality: String(item?.quality || item?.text || '') });
        }
    }
    for (const item of [data?.hd, data?.hd_url, data?.hdUrl, data?.video_url, data?.videoUrl, data?.url]) {
        if (typeof item === 'string' && /^https?:\/\//i.test(item)) urls.push({ url: item, quality: 'HD' });
    }
    return [...new Map(urls.reverse().map(item => [item.url, item])).values()]
        .sort((a, b) => Number(/hd/i.test(b.quality)) - Number(/hd/i.test(a.quality)))
        .map(item => item.url);
}

async function resolvePrexzyUrls(pageUrl) {
    if (!pageUrl) return [];
    try {
        const res = await axios.get('https://prexzyapis.com/download/tik', {
            params: { url: pageUrl },
            timeout: 30000,
            validateStatus: () => true,
            headers: { ...BROWSER_HEADERS, Accept: 'application/json, text/plain, */*' },
        });
        if (res.status < 200 || res.status >= 300 || res.data?.status === false) return [];
        return prexzyDownloadUrls(res.data);
    } catch (_) {
        return [];
    }
}

function isCloudflareChallenge(res) {
    if (!res || res.status !== 403) return false;
    const body = typeof res.data === 'string' ? res.data : '';
    return /just a moment|cf-mitigated|cloudflare/i.test(body) || res.headers?.['cf-mitigated'];
}

async function requestTikwm(requestFn) {
    // First shot: plain request with browser-shaped headers, no cost.
    let res = await requestFn(TIKWM_HEADERS);
    if (!isCloudflareChallenge(res)) return res;

    console.log('[tiksearch] tikwm blocked by Cloudflare — solving via headless browser');
    let session;
    try {
        session = await tikwmBrowser.getClearedSession();
    } catch (err) {
        console.error('[tiksearch] Cloudflare solve failed:', err.message);
        return res; // give back the original 403, nothing more we can do
    }

    res = await requestFn({
        ...TIKWM_HEADERS,
        'User-Agent': session.userAgent,
        'Cookie': session.cookieHeader,
    });

    if (isCloudflareChallenge(res)) {
        // Cached cookie was stale or the solve didn't actually stick — drop
        // it so the next call re-solves instead of reusing a dead cookie.
        tikwmBrowser.invalidateSession();
    }
    return res;
}

async function searchTikwm(query) {
    try {
        const res = await requestTikwm((headers) => axios.post(
            'https://www.tikwm.com/api/feed/search',
            new URLSearchParams({ keywords: query, count: '12', cursor: '0', HD: '1' }).toString(),
            {
                timeout: 20000,
                validateStatus: () => true,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
            }
        ));
        const arr = Array.isArray(res.data?.data?.videos)
            ? res.data.data.videos
            : collectSearchItems(res.data);
        if (!Array.isArray(arr) || !arr.length) { logProviderFailure('tikwm', res); return []; }
        return arr;
    } catch (err) { logProviderFailure('tikwm', null, err); return []; }
}

async function searchDelirius(query) {
    try {
        const res = await axios.get('https://delirius-apiofc.vercel.app/search/tiktoksearch', {
            params: { query }, timeout: 20000, validateStatus: () => true,
        });
        const arr = Array.isArray(res.data?.meta) ? res.data.meta
            : Array.isArray(res.data?.data) ? res.data.data
            : collectSearchItems(res.data);
        if (!Array.isArray(arr) || !arr.length) { logProviderFailure('delirius', res); return []; }
        return arr;
    } catch (err) { logProviderFailure('delirius', null, err); return []; }
}

async function searchTikTokBrowser(query) {
    if (!BROWSER_SEARCH_ENABLED) return [];
    let browser;
    let page;
    const responsePromises = [];
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            timeout: BROWSER_SEARCH_TIMEOUT_MS,
            protocolTimeout: BROWSER_SEARCH_TIMEOUT_MS,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        page.on('response', response => {
            if (!response.url().includes('/api/search/general/full/')) return;
            responsePromises.push(response.json().catch(() => null));
        });
        await page.goto(`https://www.tiktok.com/search?q=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded', timeout: BROWSER_SEARCH_TIMEOUT_MS,
        });
        await sleep(4_000);
        const payloads = await Promise.all(responsePromises);
        const raw = payloads.flatMap(payload => collectSearchItems(payload));
        if (!raw.length) console.error('[tiksearch] browser search returned no internal results');
        return raw;
    } catch (error) {
        console.error('[tiksearch] browser search failed:', error.message);
        return [];
    } finally {
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
}

async function findCandidates(query) {
    for (const fn of [searchTikTokApiStore, searchPrexzy, searchTikwm, searchDelirius, searchTikTokBrowser]) {
        const arr = await fn(query);
        const mapped = arr.map(shapeItem).filter(Boolean);
        if (mapped.length) return mapped.slice(0, MAX_CANDIDATES);
        if (arr.length && !mapped.length) {
            console.error(`[tiksearch] provider returned ${arr.length} raw item(s) but shapeItem() rejected all of them — response shape likely changed`);
        }
    }
    return [];
}

// ─── re-resolver (last resort per candidate) ─────────────────────────────────

async function resolveFreshUrls(pageUrl) {
    if (!pageUrl) return [];
    try {
        const res = await requestTikwm((headers) => axios.get('https://www.tikwm.com/api/', {
            params: { url: pageUrl, hd: 1 },
            timeout: 20000,
            validateStatus: () => true,
            headers,
        }));
        const d = res.data?.data;
        return pickUrls(d || {});
    } catch { return []; }
}

// ─── downloader ──────────────────────────────────────────────────────────────

async function downloadOne(url) {
    let lastErr = null;
    for (let attempt = 0; attempt <= URL_RETRIES; attempt++) {
        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 60000,
                maxContentLength: 64 * 1024 * 1024,
                headers: BROWSER_HEADERS,
                validateStatus: () => true,
            });
            if (res.status === 200 && res.data && res.data.length >= MIN_VIDEO_BYTES) {
                return Buffer.from(res.data);
            }
            if (res.status >= 500) {
                lastErr = new Error(`HTTP ${res.status}`);
                await sleep(400 * (attempt + 1));
                continue;
            }
            // 4xx / tiny body => no point retrying this URL
            return null;
        } catch (e) {
            lastErr = e;
            await sleep(400 * (attempt + 1));
        }
    }
    return null;
}

async function downloadCandidate(candidate) {
    // Try every direct URL the provider gave us.
    for (const u of candidate.urls) {
        const buf = await downloadOne(u);
        if (buf) return buf;
    }
    // Prexzy’s downloader can resolve a TikTok page when a search result only
    // contains metadata or a page URL. Try it before the older TikWM resolver.
    const prexzy = await resolvePrexzyUrls(candidate.pageUrl);
    for (const u of prexzy) {
        if (candidate.urls.includes(u)) continue;
        const buf = await downloadOne(u);
        if (buf) return buf;
    }

    // Last resort: re-resolve through tikwm with the page URL.
    const fresh = await resolveFreshUrls(candidate.pageUrl);
    for (const u of fresh) {
        if (candidate.urls.includes(u) || prexzy.includes(u)) continue;
        const buf = await downloadOne(u);
        if (buf) return buf;
    }
    return null;
}

// ─── command ─────────────────────────────────────────────────────────────────

module.exports = {
    name: 'tiksearch',
    aliases: ['tiktoksearch', 'tik', 'tikdownload', 'tikvideo'],
    description: 'Search TikTok and send the first matching video',
    category: 'media',
    usage: '.tiksearch <search query>',

    async execute({ sock, msg, from, reply, args, prefix }) {
        const px = prefixOf(prefix);
        const values = Array.isArray(args) ? args : [];
        if (!values.length) {
            return reply(
                `🎬 *TikTok Search*\n\n` +
                `Usage: ${px}tiksearch <search query>\n` +
                `Example: ${px}tiksearch Sukuna edit`
            );
        }

        const query = values.join(' ').trim().slice(0, 120);
        const cacheKey = query.toLowerCase();

        try {
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }).catch(() => {});

            // ── cache hit ────────────────────────────────────────────────
            const cached = cache.get(cacheKey);
            if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
                await sock.sendMessage(from, {
                    video: cached.result.buffer,
                    mimetype: 'video/mp4',
                    caption: cached.result.caption,
                }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
                return;
            }

            const candidates = await findCandidates(query);
            if (!candidates.length) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
                return reply(`❌ No TikTok videos found for "${query}". Try different keywords.`);
            }

            await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } }).catch(() => {});

            let chosen = null;
            let buffer = null;
            for (const cand of candidates) {
                buffer = await downloadCandidate(cand);
                if (buffer) { chosen = cand; break; }
            }

            if (!buffer || !chosen) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
                return reply(
                    `❌ Found videos for "${query}" but every download attempt failed ` +
                    `(${candidates.length} candidates tried). Try a different search.`
                );
            }

            const caption =
                `🎬 *${chosen.title}*\n\n` +
                `👤 ${chosen.author}\n` +
                `⏱️ ${chosen.duration}s   👁️ ${chosen.plays.toLocaleString()}   ❤️ ${chosen.likes.toLocaleString()}\n\n` +
                `> SUKUNA-MD 🔥`;

            await sock.sendMessage(from, {
                video: buffer,
                mimetype: 'video/mp4',
                caption,
            }, { quoted: msg });

            cache.set(cacheKey, { ts: Date.now(), result: { buffer, caption } });
            // prune cache
            if (cache.size > 50) {
                const cutoff = Date.now() - CACHE_TTL_MS;
                for (const [k, v] of cache) if (v.ts < cutoff) cache.delete(k);
            }

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (err) {
            console.error('[tiksearch] error:', err.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            reply('❌ Something went wrong searching or sending the video. Try again later.');
        }
    },
};
      

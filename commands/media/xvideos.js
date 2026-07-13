/**
 * Xvideos Command — NSFW search + download (direct scraper)
 * Usage:
 *   .xv <query>        → finds a video (>= 3 min) for the query and sends it as
 *                        a real, playable MP4.
 *   .xv <xvideos url>  → downloads that specific video and sends it.
 *
 * Reliability: the old third-party APIs went offline, so this scrapes
 * xvideos.com directly. Video pages embed direct MP4 URLs via
 * html5player.setVideoUrlHigh/Low(...). We download the MP4 to a real buffer
 * (with a browser UA + referer to avoid 403 hot-link blocking) and send the
 * bytes to WhatsApp so it always plays.
 */

'use strict';
const axios = require('axios');

const BASE = 'https://www.xvideos.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MIN_DURATION = 180;              // must be at least 3 minutes
const MAX_BYTES = 60 * 1024 * 1024;    // hard cap so we never try to send huge files
const PREFERRED_MAX = 45 * 1024 * 1024;

function headers(referer) {
    const h = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };
    if (referer) h.Referer = referer;
    return h;
}

// Pull unique video page paths out of a search results page.
function parseSearch(html) {
    const results = [];
    const seen = new Set();
    const re = /<p class="title"><a href="(\/(?:video|prof-video-click)[^"]+)"[^>]*title="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) {
        let path = m[1].split('?')[0];
        // prof-video-click links wrap the real /video path — normalise to /video...
        const vm = path.match(/\/video[.a-z0-9]*\d+\/[a-z0-9_\-]+/i);
        if (vm) path = vm[0];
        if (!/^\/video/i.test(path) || seen.has(path)) continue;
        seen.add(path);
        results.push({ path, title: decodeEntities(m[2]) });
    }
    // Fallback: bare href scan if the structured parse found nothing.
    if (!results.length) {
        const re2 = /href="(\/video[.a-z0-9]*\d+\/[a-z0-9_\-]+)"/gi;
        while ((m = re2.exec(html))) {
            const path = m[1];
            if (seen.has(path)) continue;
            seen.add(path);
            results.push({ path, title: '' });
        }
    }
    return results;
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function fmtDuration(sec) {
    sec = Number(sec) || 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// Fetch a video page and extract its direct MP4 URLs + metadata.
async function getVideoInfo(path) {
    const url = path.startsWith('http') ? path : BASE + path;
    const { data: html } = await axios.get(url, { headers: headers(BASE), timeout: 25000 });
    const grab = (re) => (html.match(re) || [])[1] || null;
    return {
        pageUrl: url,
        title: decodeEntities(grab(/setVideoTitle\('([^']+)'\)/)) || 'Xvideos',
        high: grab(/setVideoUrlHigh\('([^']+)'\)/),
        low: grab(/setVideoUrlLow\('([^']+)'\)/),
        hls: grab(/setVideoHLS\('([^']+)'\)/),
        duration: Number(grab(/<meta property="og:duration" content="(\d+)"/)) || 0,
    };
}

// Download an MP4 URL into a buffer, enforcing the size cap.
async function downloadMp4(url, referer) {
    const resp = await axios.get(url, {
        headers: headers(referer),
        timeout: 120000,
        responseType: 'arraybuffer',
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
    });
    return Buffer.from(resp.data);
}

// Try low quality first (smaller, more reliable to send), then high.
async function fetchPlayable(info) {
    const attempts = [];
    if (info.low) attempts.push(info.low);
    if (info.high) attempts.push(info.high);
    for (const u of attempts) {
        try {
            const buf = await downloadMp4(u, info.pageUrl);
            if (buf && buf.length > 10000 && buf.length <= MAX_BYTES) {
                return buf;
            }
        } catch (e) {
            console.error('[xvideos] download failed:', e.message);
        }
    }
    return null;
}

async function search(query) {
    const url = `${BASE}/?k=${encodeURIComponent(query)}`;
    const { data: html } = await axios.get(url, { headers: headers(BASE), timeout: 25000 });
    return parseSearch(html);
}

module.exports = {
    name: 'xvideos',
    aliases: ['xv', 'xvid', 'xvsearch'],
    description: 'Search Xvideos and send a playable video (NSFW)',
    category: 'media',
    nsfw: true,
    async execute({ sock, msg, from, reply, args }) {
        if (!args.length) {
            return reply(
                `🔞 *Xvideos*\n\n` +
                `Usage:\n` +
                `  .xv <query>        → search & send a video (3+ min)\n` +
                `  .xv <xvideos url>  → download a specific video\n\n` +
                `⚠️ NSFW — use only in allowed chats.`
            );
        }

        const input = args.join(' ').trim();

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

            // Build the list of candidate video pages.
            let candidates;
            if (/xvideos\.com\//i.test(input)) {
                candidates = [{ path: input, title: '' }];
            } else {
                const results = await search(input);
                if (!results.length) {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
                    return reply(`❌ No results found for *${input}*.`);
                }
                candidates = results.slice(0, 12);
            }

            // Walk candidates: pick the first one that is >= 3 min AND has a
            // downloadable MP4 within our size cap.
            let chosen = null;
            let chosenBuf = null;
            let sawShort = false;

            for (const c of candidates) {
                let info;
                try {
                    info = await getVideoInfo(c.path);
                } catch (e) {
                    console.error('[xvideos] page failed:', e.message);
                    continue;
                }
                if (!info.high && !info.low) continue;

                // Enforce the 3-minute minimum for query searches. For a direct
                // URL we still send it even if short (user asked for that video).
                const isDirectUrl = candidates.length === 1 && /xvideos\.com\//i.test(input);
                if (!isDirectUrl && info.duration && info.duration < MIN_DURATION) {
                    sawShort = true;
                    continue;
                }

                const buf = await fetchPlayable(info);
                if (buf) { chosen = info; chosenBuf = buf; break; }
            }

            if (!chosen || !chosenBuf) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
                return reply(
                    sawShort
                        ? `⚠️ Found results but none met the 3-minute minimum with a downloadable video. Try another search term.`
                        : `❌ Couldn't fetch a playable video for *${input}*. Please try again.`
                );
            }

            const sizeMb = (chosenBuf.length / 1048576).toFixed(1);
            const caption =
                `🔞 *${chosen.title}*\n` +
                `⏱️ ${fmtDuration(chosen.duration)}   •   💾 ${sizeMb}MB\n\n` +
                `> SUKUNA MD`;

            await sock.sendMessage(
                from,
                {
                    video: chosenBuf,
                    mimetype: 'video/mp4',
                    caption,
                    ...(chosenBuf.length > PREFERRED_MAX ? { fileName: `${chosen.title}.mp4` } : {}),
                },
                { quoted: msg }
            );
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (err) {
            console.error('[xvideos] error:', err.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            reply('❌ Request failed. Please try again later.');
        }
    },
};

/**
 * YouTube Command — Search OR download YouTube videos
 * Usage:
 *   .yt <search query>     → search results
 *   .yt <youtube url>      → download video
 *
 * Download uses a multi-strategy fallback chain (same pattern as .play):
 * if one provider is down or changes its response shape, the next one
 * is tried automatically. Search uses the local `yt-search` package
 * instead of a third-party Invidious mirror, since those mirrors go
 * offline/rate-limit constantly and were causing `.yt <query>` to fail.
 */

'use strict';
const axios = require('axios');
const yts = require('yt-search');

const YT_URL_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;

function extractId(url) {
    const m = url.match(YT_URL_RE);
    return m ? m[1] : null;
}

function pickVideoUrl(d) {
    if (!d) return null;
    const cands = [
        d.video, d.videoUrl, d.video_url, d.url, d.download_url, d.downloadUrl,
        d.mp4, d.hd, d.sd, d.link,
        d.result?.video, d.result?.url, d.result?.download_url, d.result?.downloadUrl, d.result?.mp4,
        d.data?.video, d.data?.url, d.data?.download_url, d.data?.downloadUrl, d.data?.mp4,
        d.data?.videoUrl,
        d.result?.download_url, d.result?.downloadUrl,
        d.data?.result?.download_url, d.data?.result?.downloadUrl,
    ];
    for (const c of cands) {
        if (typeof c === 'string' && /^https?:\/\//.test(c)) return c;
        if (Array.isArray(c) && c.length && typeof c[0] === 'string' && /^https?:\/\//.test(c[0])) return c[0];
    }
    const nestedLinks = d.download_links || d.downloads || d.result?.download_links || d.data?.download_links || d.data?.downloads;
    if (Array.isArray(nestedLinks)) {
        const preferred = nestedLinks.find(item => /720|1080|hd/i.test(item?.quality || item?.label || '')) || nestedLinks[0];
        if (typeof preferred === 'string' && /^https?:\/\//.test(preferred)) return preferred;
        if (preferred && typeof preferred.url === 'string' && /^https?:\/\//.test(preferred.url)) return preferred.url;
    }
    // formats array
    const fmts = d.formats || d.result?.formats || d.data?.formats;
    if (Array.isArray(fmts)) {
        const v = fmts.find(f => (f.type === 'video' || /mp4/i.test(f.format || f.mimetype || ''))) || fmts[0];
        if (v && typeof v.url === 'string') return v.url;
    }
    return null;
}

function pickMeta(d, fallbackTitle) {
    const root = d?.data || d?.result || d || {};
    return {
        title: root.title || root.name || fallbackTitle || 'YouTube Video',
        author: root.author || root.channel || root.uploader || (root.author?.name) || '',
        duration: root.duration || root.length || root.timestamp || '',
        thumbnail: root.thumbnail || root.image || root.thumb || '',
    };
}

// Verifies a resolved "video" URL is actually a live, playable video before
// we ever send it to WhatsApp. This is what catches providers that silently
// return a broken link, an HTML error page, or an unrelated cached/demo file
// instead of the real download (the root cause of "something is wrong with
// the video file" errors — the bot was trusting the JSON blindly before).
async function validateVideoUrl(url) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    };
    let res;
    try {
        res = await axios.head(url, { timeout: 15000, headers, maxRedirects: 5, validateStatus: () => true });
    } catch (e) {
        throw new Error(`validation HEAD failed: ${e.message}`);
    }

    // Some CDNs don't support HEAD properly (405/403) — fall back to a tiny ranged GET.
    if (res.status >= 400 || !res.headers) {
        try {
            res = await axios.get(url, {
                timeout: 15000,
                headers: { ...headers, Range: 'bytes=0-2048' },
                maxRedirects: 5,
                validateStatus: () => true,
                responseType: 'arraybuffer',
            });
        } catch (e) {
            throw new Error(`validation GET fallback failed: ${e.message}`);
        }
    }

    if (res.status >= 400) {
        throw new Error(`video url returned HTTP ${res.status}`);
    }

    const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error(`video url is not a video (content-type: ${contentType || 'unknown'})`);
    }

    const len = Number(res.headers?.['content-length'] || 0);
    if (len && len < 10 * 1024) {
        // Suspiciously tiny "video" — almost always an error/placeholder payload.
        throw new Error(`video url too small to be real (${len} bytes)`);
    }

    return true;
}

// Each strategy resolves { video, title, author, duration, thumbnail } or throws.
const strategies = [
    // Strategy 1 (PRIMARY): eliteprotech-apis.zone.id/ytmp4
    // The exact query-param name isn't publicly documented, so this tries the
    // common variants in order and moves on the moment one is accepted —
    // whichever one the API expects will just work, the rest are skipped.
    async (url) => {
        const paramNames = ['url', 'link', 'youtube_url', 'q'];
        let lastErr;
        for (const p of paramNames) {
            try {
                const { data } = await axios.get(
                    `https://eliteprotech-apis.zone.id/ytmp4?${p}=${encodeURIComponent(url)}`,
                    { timeout: 45000 }
                );
                const video = pickVideoUrl(data);
                if (video) return { video, ...pickMeta(data) };
                lastErr = new Error(`eliteprotech: no video url in response (param=${p})`);
            } catch (e) {
                lastErr = new Error(`eliteprotech (param=${p}): ${e.response?.status || e.message}`);
            }
        }
        throw lastErr || new Error('eliteprotech: all param variants failed');
    },
    // Strategy 2: davidcyril API (same reliable provider already used by .play for audio)
    async (url) => {
        const { data } = await axios.get(
            `https://apis.davidcyril.name.ng/download/ytmp4?url=${encodeURIComponent(url)}`,
            { timeout: 45000 }
        );
        const video = pickVideoUrl(data);
        if (!video) throw new Error('davidcyril: no video url');
        return { video, ...pickMeta(data) };
    },
    // Strategy 3: agatz.xyz (same family already used as a fallback in .play)
    async (url) => {
        const { data } = await axios.get(
            `https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(url)}`,
            { timeout: 45000 }
        );
        const video = pickVideoUrl(data) || data?.data?.downloadUrl;
        if (!video) throw new Error('agatz: no video url');
        return { video, ...pickMeta(data) };
    },
    // Strategy 4: prexzyapis (original provider — kept as a further fallback)
    async (url) => {
        const { data } = await axios.get(
            `https://prexzyapis.com/download/youtube-video?url=${encodeURIComponent(url)}`,
            { timeout: 45000 }
        );
        const video = pickVideoUrl(data);
        if (!video) throw new Error('prexzyapis: no video url');
        return { video, ...pickMeta(data) };
    },
];

async function downloadYt(url) {
    let lastErr;
    for (const strategy of strategies) {
        try {
            const r = await strategy(url);
            if (!r?.video) continue;
            // Reject silently-broken or unrelated responses before trusting them.
            await validateVideoUrl(r.video);
            return r;
        } catch (e) {
            lastErr = e;
            console.error('[yt] strategy failed:', e.message);
        }
    }
    throw lastErr || new Error('All download strategies failed');
}

async function searchYouTube(query) {
    const r = await yts(query);
    const videos = (r?.videos || []).slice(0, 5);
    return videos.map(v => ({
        title: v.title,
        author: v.author?.name || '',
        views: v.views,
        durationText: v.timestamp,
        videoId: v.videoId,
        url: v.url,
    }));
}

module.exports = {
    name: 'youtube',
    aliases: ['yt', 'ytv', 'ytmp4', 'ytdl'],
    description: 'Search or download YouTube videos',
    category: 'media',
    async execute({ sock, msg, from, reply, args }) {
        if (!args.length) {
            return reply(
                `📺 *YouTube*\n\n` +
                `Usage:\n` +
                `  .yt <youtube url>   → download video\n` +
                `  .yt <search query>  → search`
            );
        }

        const input = args.join(' ').trim();

        if (YT_URL_RE.test(input)) {
            const videoId = extractId(input);
            const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : input;
            try {
                await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
                const r = await downloadYt(cleanUrl);
                if (!r?.video) {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                    return reply('❌ Could not extract video. The link may be private, age-restricted, or too long. Try another URL.');
                }
                await sock.sendMessage(from, {
                    video: { url: r.video },
                    mimetype: 'video/mp4',
                    caption: `📺 *${r.title}*${r.author ? `\n👤 ${r.author}` : ''}${r.duration ? `\n⏱️ ${r.duration}` : ''}\n\n> SUKUNA MD`,
                }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                console.error('[yt] download error:', err.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply('❌ Download failed — all providers are currently unavailable. Please try again shortly.');
            }
            return;
        }

        try {
            await reply(`🔍 Searching YouTube for: *${input}*...`);
            const results = await searchYouTube(input);
            if (!results?.length) return reply('❌ No results found.');

            let response = `📺 *YouTube Results*\n\n`;
            results.forEach((video, i) => {
                const views = video.views ? `👁️ ${(video.views / 1000).toFixed(1)}K` : '';
                const dur = video.durationText ? `⏱️ ${video.durationText}` : '';
                response += `${i + 1}. *${video.title}*\n   👤 ${video.author || 'Unknown'} ${views} ${dur}\n   🔗 ${video.url}\n\n`;
            });
            response += `_Reply with .yt <link> to download any of these_`;
            reply(response);
        } catch (err) {
            console.error('[yt] search error:', err.message);
            reply('❌ Failed to search YouTube. Please try again.');
        }
    }
};

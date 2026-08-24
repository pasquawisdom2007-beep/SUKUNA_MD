/**
 * Xvideos Search/Download Command
 * Usage: .xvideos <search query or xvideos URL>
 *
 * Uses Prexzy's Xvideos search and downloader endpoints. Search results are
 * resolved through the downloader endpoint so the command always sends a
 * direct MP4 buffer instead of returning a page link.
 */
'use strict';

const axios = require('axios');
const { prefixOf } = require('../../utils/commandHelpers');

const SEARCH_ENDPOINT = 'https://prexzyapis.com/nsfw/xvideos-search';
const DOWNLOAD_ENDPOINT = 'https://prexzyapis.com/nsfw/xvideos-dl';
const REQUEST_TIMEOUT_MS = 45_000;
const DOWNLOAD_TIMEOUT_MS = 75_000;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
const MIN_VIDEO_BYTES = 10 * 1024;
const MAX_CANDIDATES = 5;
const MAX_SHORT_SECONDS = 180;

function cleanText(value, fallback = 'Unknown', maxLength = 180) {
    const cleaned = String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .trim();
    if (!cleaned) return fallback;
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
}

function isXvideosUrl(value) {
    try {
        const url = new URL(String(value).trim());
        return /^https?:$/i.test(url.protocol) && /(^|\.)xvideos\.com$/i.test(url.hostname);
    } catch (_) {
        return false;
    }
}

function parseDuration(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    const parts = raw.split(':').map(Number);
    if (parts.some(part => !Number.isFinite(part))) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

function formatDuration(value) {
    const seconds = parseDuration(value);
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function normalizeSearchItem(item) {
    if (!item || typeof item !== 'object' || !isXvideosUrl(item.url)) return null;
    return {
        pageUrl: item.url,
        title: cleanText(item.title, 'Xvideos video', 180),
        duration: parseDuration(item.duration),
        author: cleanText(item.author || item.uploader, 'Unknown', 100),
        thumb: isHttpUrl(item.thumb) ? item.thumb : '',
    };
}

function isHttpUrl(value) {
    try {
        const url = new URL(String(value).trim());
        return /^https?:$/i.test(url.protocol);
    } catch (_) {
        return false;
    }
}

function addDirectUrl(out, value, quality = '') {
    const url = typeof value === 'string' ? value : value?.url || value?.download_url || value?.downloadUrl;
    if (!isHttpUrl(url)) return;
    if (!out.some(item => item.url === url)) out.push({ url, quality: cleanText(quality || value?.quality || value?.label, '', 40) });
}

function directUrls(info) {
    const data = info?.data && typeof info.data === 'object' ? info.data : info || {};
    const out = [];
    addDirectUrl(out, data.best, 'best');
    if (Array.isArray(data.qualities)) {
        for (const quality of data.qualities) addDirectUrl(out, quality, quality?.quality || quality?.label || quality?.format);
    }
    for (const value of [data.video_url, data.videoUrl, data.download_url, data.downloadUrl, data.url]) {
        addDirectUrl(out, value, 'direct');
    }
    return out.sort((a, b) => {
        const score = value => {
            const match = String(value.quality).match(/(\d{3,4})\s*p?/i);
            return match ? Number(match[1]) : (/best|hd/i.test(value.quality) ? 9999 : 0);
        };
        return score(b) - score(a);
    }).map(item => item.url);
}

async function searchVideos(query) {
    const response = await axios.get(SEARCH_ENDPOINT, {
        params: { query },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
        headers: { 'User-Agent': 'SUKUNA-MD/3.0', Accept: 'application/json' },
    });
    if (response.status < 200 || response.status >= 300 || response.data?.status === false) {
        throw new Error(`Search API ${response.status}`);
    }
    const videos = Array.isArray(response.data?.videos) ? response.data.videos : [];
    const normalized = videos.map(normalizeSearchItem).filter(Boolean);
    if (!normalized.length) throw new Error('No search results');

    const short = normalized.filter(video => video.duration > 0 && video.duration <= MAX_SHORT_SECONDS);
    return (short.length ? short : normalized).slice(0, MAX_CANDIDATES);
}

async function fetchDownloadInfo(pageUrl) {
    const response = await axios.get(DOWNLOAD_ENDPOINT, {
        params: { url: pageUrl },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
        headers: { 'User-Agent': 'SUKUNA-MD/3.0', Accept: 'application/json' },
    });
    if (response.status < 200 || response.status >= 300 || response.data?.status === false) {
        throw new Error(`Download API ${response.status}`);
    }
    return response.data;
}

function looksLikeVideo(buffer, contentType = '') {
    if (!Buffer.isBuffer(buffer) || buffer.length < MIN_VIDEO_BYTES) return false;
    if (/^video\//i.test(contentType)) return true;
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp'
        || buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
}

async function downloadDirect(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_VIDEO_BYTES,
        maxBodyLength: MAX_VIDEO_BYTES,
        validateStatus: () => true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
            Accept: 'video/mp4,video/*,*/*;q=0.8',
            Referer: 'https://www.xvideos.com/',
        },
    });
    const contentType = String(response.headers?.['content-type'] || '').split(';')[0];
    const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data || '');
    if (response.status !== 200 || buffer.length > MAX_VIDEO_BYTES || !looksLikeVideo(buffer, contentType)) return null;
    return buffer;
}

async function downloadPage(pageUrl) {
    const info = await fetchDownloadInfo(pageUrl);
    const urls = directUrls(info);
    if (!urls.length) throw new Error('No direct MP4 quality link');
    for (const url of urls) {
        try {
            const buffer = await downloadDirect(url);
            if (buffer) return { buffer, info };
        } catch (_) {
            // Try the next quality when a CDN link expires or exceeds the cap.
        }
    }
    throw new Error('All direct video links failed');
}

function captionFor(video, info) {
    const data = info?.data && typeof info.data === 'object' ? info.data : info || {};
    const title = cleanText(data.title || video.title, 'Xvideos video', 180);
    const author = cleanText(data.uploader?.name || video.author, 'Unknown', 100);
    const duration = formatDuration(data.duration || video.duration);
    return `🔞 *${title}*\n\n👤 ${author}\n⏱️ ${duration}\n\n> SUKUNA MD • 18+`;
}

module.exports = {
    name: 'xvideos',
    aliases: ['xvideo', 'xv'],
    description: 'Download a short Xvideos video from a search query or URL (18+)',
    category: 'media',
    nsfw: true,
    usage: '.xvideos <search query or Xvideos URL>',

    async execute({ sock, msg, from, reply, args, prefix }) {
        const px = prefixOf(prefix);
        const input = Array.isArray(args) ? args.join(' ').trim() : '';
        if (!input) {
            return reply(`🔞 *Xvideos Search/Download*\n\nUsage: ${px}xvideos <search query or Xvideos URL>\nExample: ${px}xvideos short video`);
        }

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
            const direct = isXvideosUrl(input);
            const candidates = direct
                ? [{ pageUrl: input, title: 'Xvideos video', duration: 0, author: 'Unknown' }]
                : await searchVideos(input.slice(0, 120));

            let chosen = null;
            let info = null;
            let buffer = null;
            for (const candidate of candidates) {
                try {
                    const downloaded = await downloadPage(candidate.pageUrl);
                    chosen = candidate;
                    info = downloaded.info;
                    buffer = downloaded.buffer;
                    break;
                } catch (error) {
                    console.error(`[xvideos] candidate failed: ${error.message}`);
                }
            }
            if (!buffer || !chosen) {
                throw new Error(direct ? 'The Xvideos URL could not be downloaded' : 'Search results had no downloadable short video');
            }

            await sock.sendMessage(from, {
                video: buffer,
                mimetype: 'video/mp4',
                caption: captionFor(chosen, info),
            }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (error) {
            console.error('[xvideos] error:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply(`❌ Xvideos download failed: ${error.message === 'No search results' ? 'no matching videos were found' : 'the provider could not return a short video right now'}.`);
        }
    },
};

module.exports.searchVideos = searchVideos;
module.exports.directUrls = directUrls;

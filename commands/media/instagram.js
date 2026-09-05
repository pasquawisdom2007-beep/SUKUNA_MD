'use strict';

/**
 * Instagram Command — Download Instagram media
 * Usage: .instagram <post/reel url>  (aliases: .ig, .igdl)
 *
 * The previous version of this file called two API resellers using
 * placeholder keys ("your_api_key", "apikey=free") that were never real
 * credentials, so every request failed. This version instead calls two
 * independent, free, keyless public downloader deployments and falls back
 * from one to the other, mirroring the multi-provider pattern already used
 * by commands/downloader/video.js in this repo. Whatever bytes come back
 * are verified to actually be image/video data before anything is sent,
 * so a provider returning an HTML error page can't be sent to the user
 * as if it were their media.
 *
 * Known limitation: both providers work by reading Instagram's own public
 * page data, which Instagram does not officially support and can change
 * or block at any time without notice. If both providers fail, that is
 * almost always the reason — not a bug in this file. Re-check provider
 * status (or add a third PROVIDERS entry) if this stops working later.
 */

const axios = require('axios');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const JSON_TIMEOUT_MS = 20_000;
// Provider 1 runs on a free Render instance, which sleeps after inactivity
// and can take 30-50s to cold-start on the first request. The timeout is
// generous on purpose so that cold start doesn't look like a hard failure.
const COLD_START_TIMEOUT_MS = 55_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_MEDIA_BYTES = 90 * 1024 * 1024;
const MIN_MEDIA_BYTES = 512;

function isInstagramUrl(value) {
    return typeof value === 'string' && /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\//i.test(value.trim());
}

function isHttpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

async function getJson(url, options = {}) {
    const { data, status } = await axios.get(url, {
        timeout: options.timeout || JSON_TIMEOUT_MS,
        maxContentLength: 4 * 1024 * 1024,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*' },
        validateStatus: () => true,
        ...options,
    });
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    if (typeof data === 'string' && /^\s*</.test(data)) throw new Error('provider returned HTML instead of JSON');
    return data;
}

/**
 * Provider A: instagram-reel-api (VirtualPirate), hosted on Render.
 * https://github.com/VirtualPirate/insta-reel-api
 * Response: { title, url, description, thumbnail, download_link }
 */
async function fromReelApi(postUrl) {
    const data = await getJson('https://instagram-reel-api.onrender.com/', {
        params: { url: postUrl },
        timeout: COLD_START_TIMEOUT_MS,
    });
    const mediaUrl = data?.download_link;
    if (!isHttpUrl(mediaUrl)) throw new Error('no download_link in response');
    return {
        mediaUrl,
        caption: String(data?.title || data?.description || '').trim(),
        thumbnail: isHttpUrl(data?.thumbnail) ? data.thumbnail : '',
        author: '',
        provider: 'reel-api',
    };
}

/**
 * Provider B: Instagram-reels-downloader (riad-azz), hosted on Vercel.
 * https://github.com/Okramjimmy/Instagram-reels-downloader
 * Enhanced response: { success, data: { title, author, thumbnail, medias: [...] } }
 */
async function fromVercelDownloader(postUrl) {
    const data = await getJson('https://instagram-reels-downloader-tau.vercel.app/api/video', {
        params: { postUrl, enhanced: 'true' },
    });
    const payload = data?.data || {};
    const medias = Array.isArray(payload.medias) ? payload.medias : [];
    const bestMedia = medias.find(m => m?.type === 'video' && isHttpUrl(m?.url))
        || medias.find(m => isHttpUrl(m?.url));
    const mediaUrl = bestMedia?.url || (isHttpUrl(payload.videoUrl) ? payload.videoUrl : '');
    if (!isHttpUrl(mediaUrl)) throw new Error('no usable media url in response');
    return {
        mediaUrl,
        caption: String(payload.title || '').trim(),
        thumbnail: isHttpUrl(payload.thumbnail) ? payload.thumbnail : '',
        author: String(payload.author || payload.owner?.username || '').trim(),
        isVideo: bestMedia ? bestMedia.type === 'video' : true,
        provider: 'vercel-downloader',
    };
}

function looksLikeMedia(buffer, contentType) {
    const type = String(contentType || '').toLowerCase();
    if (type.includes('text/html') || type.includes('application/json')) return false;
    if (type.includes('video/') || type.includes('image/')) return true;
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
    const isMp4 = buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    return isMp4 || isJpeg || isPng || isWebp;
}

async function downloadBinary(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_MEDIA_BYTES,
        maxRedirects: 6,
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'video/mp4,image/*,application/octet-stream;q=0.8,*/*;q=0.5',
        },
        validateStatus: () => true,
    });
    const buffer = Buffer.from(response.data || '');
    const contentType = response.headers?.['content-type'] || '';
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status} downloading media`);
    if (buffer.length < MIN_MEDIA_BYTES) throw new Error('downloaded file is empty or too small');
    if (!looksLikeMedia(buffer, contentType)) throw new Error(`downloaded file is not image/video (content-type: ${contentType || 'unknown'})`);
    const isVideo = contentType.includes('video/') || buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    return { buffer, isVideo };
}

async function resolveAndDownload(postUrl) {
    const providers = [
        ['reel-api', fromReelApi],
        ['vercel-downloader', fromVercelDownloader],
    ];
    let lastError = null;

    for (const [name, provider] of providers) {
        let info;
        try {
            info = await provider(postUrl);
        } catch (error) {
            lastError = error;
            console.error(`[instagram] ${name} lookup failed:`, error.message);
            continue;
        }

        try {
            const { buffer, isVideo } = await downloadBinary(info.mediaUrl);
            return { buffer, isVideo, caption: info.caption, author: info.author, provider: name };
        } catch (error) {
            lastError = error;
            console.error(`[instagram] ${name} media download failed:`, error.message);
        }
    }

    throw lastError || new Error('No provider returned usable media');
}

module.exports = {
    name: 'instagram',
    aliases: ['ig', 'igdl'],
    description: 'Download Instagram photos/videos from a post or reel link',
    category: 'media',

    async execute({ sock, msg, from, reply, args }) {
        const url = (args && args[0] || '').trim();

        if (!url) {
            return reply(
                `📸 *Instagram Downloader*\n\n` +
                `Usage: .instagram <post/reel url>\n` +
                `Example: .instagram https://www.instagram.com/reel/C0djb2Yow4C/`
            );
        }

        if (!isInstagramUrl(url)) {
            return reply('❌ Please provide a valid Instagram post or reel URL (instagram.com/p/... or /reel/...).');
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        try {
            const { buffer, isVideo, caption, author } = await resolveAndDownload(url);
            const captionText = [
                isVideo ? '📸 *Instagram Video*' : '📸 *Instagram Photo*',
                author ? `👤 ${author}` : '',
                caption ? `\n${caption.slice(0, 400)}` : '',
            ].filter(Boolean).join('\n');

            if (isVideo) {
                await sock.sendMessage(from, { video: buffer, mimetype: 'video/mp4', caption: captionText }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { image: buffer, caption: captionText }, { quoted: msg });
            }
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (error) {
            console.error('[instagram command]', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            await reply(
                '❌ Could not download that Instagram post right now.\n\n' +
                'This usually means: the post is private, the link is wrong, or both backing services are temporarily down ' +
                '(one runs on a free host that can take up to a minute to wake up on its first request — worth trying again once).'
            );
        }
    },
};

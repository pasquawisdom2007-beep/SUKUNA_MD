'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const yts = require('yt-search');

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const SEARCH_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const SUPREME_API = 'https://apissupreme.vercel.app/media/ytmp3';
const DAVID_API = 'https://apis.davidcyril.name.ng';
const PREXZY_API = 'https://prexzyapis.com';

function safeFileName(value) {
    return String(value || 'audio')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/[^a-z0-9 _-]/gi, '')
        .trim()
        .slice(0, 80) || 'audio';
}

function findDownloadUrl(value, depth = 0, seen = new Set()) {
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return '';
    seen.add(value);
    const preferred = ['download_url', 'downloadUrl', 'audio', 'url', 'link'];
    for (const key of preferred) {
        const candidate = value[key];
        if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
    }
    for (const child of Object.values(value)) {
        const found = findDownloadUrl(child, depth + 1, seen);
        if (found) return found;
    }
    return '';
}

function assertAudioBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 20 * 1024) {
        throw new Error('Downloaded audio is incomplete or too small.');
    }
    if (buffer.length > MAX_AUDIO_BYTES) {
        throw new Error('Downloaded audio is too large for WhatsApp.');
    }
    const hasId3 = buffer.subarray(0, 3).toString() === 'ID3';
    let hasMpegFrame = false;
    for (let i = 0; i < Math.min(buffer.length - 1, 10000); i += 1) {
        if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
            hasMpegFrame = true;
            break;
        }
    }
    if (!hasId3 && !hasMpegFrame) throw new Error('Downloaded file is not a valid MP3.');
}

async function downloadDirectAudio(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 10,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'audio/mpeg, audio/*, application/octet-stream, */*',
        },
        maxContentLength: MAX_AUDIO_BYTES,
        maxBodyLength: MAX_AUDIO_BYTES,
    });
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
        throw new Error('Download link returned an error response.');
    }
    const buffer = Buffer.from(response.data);
    assertAudioBuffer(buffer);
    return buffer;
}

async function getAudioFromSupreme(videoUrl) {
    const response = await axios.get(SUPREME_API, {
        params: { apikey: 'supreme', url: videoUrl },
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 10,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'audio/mpeg, application/json, */*',
        },
    });
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    const buffer = Buffer.from(response.data);
    if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
        assertAudioBuffer(buffer);
        return buffer;
    }
    let payload;
    try {
        payload = JSON.parse(buffer.toString('utf8'));
    } catch (_) {
        throw new Error('Supreme API returned an invalid response.');
    }
    if (payload.success === false || payload.status === false) {
        throw new Error(payload.message || payload.error || 'Supreme API download failed.');
    }
    const downloadUrl = findDownloadUrl(payload);
    if (!downloadUrl) throw new Error('Supreme API did not provide an audio download URL.');
    return downloadDirectAudio(downloadUrl);
}

async function getAudioFromProvider(baseUrl, pathname, videoUrl, label) {
    const response = await axios.get(`${baseUrl}${pathname}`, {
        params: { url: videoUrl },
        responseType: 'json',
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: { Accept: 'application/json', 'User-Agent': 'SUKUNA-MD/3.0' },
    });
    const payload = response.data || {};
    if (response.status < 200 || response.status >= 300 || payload.success === false || payload.status === false) {
        throw new Error(`${label} returned HTTP ${response.status}`);
    }
    const downloadUrl = findDownloadUrl(payload);
    if (!downloadUrl) throw new Error(`${label} returned no audio URL.`);
    return downloadDirectAudio(downloadUrl);
}

async function getAudioBuffer(videoUrl) {
    const providers = [
        ['Supreme', () => getAudioFromSupreme(videoUrl)],
        ['David Cyril', () => getAudioFromProvider(DAVID_API, '/download/ytmp3', videoUrl, 'David Cyril')],
        ['Prexzy', () => getAudioFromProvider(PREXZY_API, '/download/ytmp3', videoUrl, 'Prexzy')],
    ];
    let lastError;
    for (const [name, provider] of providers) {
        try {
            const buffer = await provider();
            assertAudioBuffer(buffer);
            return buffer;
        } catch (error) {
            lastError = error;
            console.warn(`[play] ${name} download failed:`, error.message);
        }
    }
    throw lastError || new Error('All audio providers failed.');
}

async function fetchThumbnail(url) {
    if (!/^https?:\/\//i.test(String(url || ''))) return null;
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15_000,
            maxContentLength: 5 * 1024 * 1024,
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
        });
        const contentType = String(response.headers['content-type'] || '').toLowerCase();
        if (!contentType.includes('image/')) return null;
        return Buffer.from(response.data);
    } catch (_) {
        return null;
    }
}

async function searchSong(query) {
    const result = await yts(`${query} official audio`);
    const video = result.videos?.[0];
    if (!video?.url) throw new Error('Could not find that song on YouTube.');
    return video;
}

async function sendPreview(sock, from, msg, video) {
    const title = video.title || 'YouTube audio';
    const caption = [
        `🎵 *${title}*`,
        video.author?.name ? `👤 ${video.author.name}` : video.author ? `👤 ${video.author}` : '',
        video.timestamp ? `⏱️ ${video.timestamp}` : video.duration ? `⏱️ ${video.duration}` : '',
        '',
        '_Preparing your audio..._',
    ].filter(Boolean).join('\n');
    const thumbnail = await fetchThumbnail(video.thumbnail);
    if (thumbnail) {
        await sock.sendMessage(from, { image: thumbnail, caption }, { quoted: msg });
    } else {
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
    }
}

module.exports = {
    name: 'play',
    aliases: ['song', 'music', 'audio'],
    description: 'Search YouTube, show the song preview image, and send MP3 audio',
    usage: '.play <song name or YouTube URL>',
    category: 'media',
    async execute({ sock, msg, from, args, reply }) {
        const query = args.join(' ').trim();
        if (!query) return reply('🎵 Provide a song name!\nExample: .play Not Like Us');
        if (query.length > 100) return reply('📝 Song name too long! Maximum 100 characters.');

        await reply(
            `╭─❒ ◈ 𝙎𝙐𝙆𝙐𝙉𝘼 𝙈𝘿 ❒\n` +
            `│ 🔍 Searching YouTube for: *${query}*...\n` +
            `╰─⛧ 𝙎𝙪𝙠𝙪𝙣𝙖 𝙈𝘿`
        );
        await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }).catch(() => {});
        try {
            const video = await searchSong(query);
            await sendPreview(sock, from, msg, video);
            const audio = await getAudioBuffer(video.url);
            const title = safeFileName(video.title);
            const fileName = `${title}.mp3`;
            const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sukuna-play-'));
            const filePath = path.join(tempDir, fileName);
            try {
                fs.writeFileSync(filePath, audio, { mode: 0o600 });
                await sock.sendMessage(from, {
                    document: audio,
                    mimetype: 'audio/mpeg',
                    fileName,
                    caption: `🎵 ${video.title}`,
                }, { quoted: msg });
                await sock.sendMessage(from, {
                    audio,
                    mimetype: 'audio/mpeg',
                    fileName,
                    ptt: false,
                }, { quoted: msg });
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (error) {
            console.error('[play]', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply(`🚫 *PLAY ERROR*\n\n${error.message}`);
        }
    },
};
            

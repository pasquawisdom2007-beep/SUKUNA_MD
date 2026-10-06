'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const YT_DLP_TIMEOUT_MS = 90_000;
const PREXZY_API = 'https://prexzyapis.com';
const ELITE_API = 'https://eliteprotech-apis.zone.id';
// Easy configuration: paste your RapidAPI key into RAPIDAPI_KEY_OVERRIDE if
// you do not want to configure Render environment variables. Environment
// variables still take priority, so the key does not need to be committed.
const RAPIDAPI_KEY_OVERRIDE = 'f66a5cfcccmsh41d60daed9f894cp12dfb4jsn0869a1509a4b';
const RAPIDAPI_HOST_OVERRIDE = 'spotify-music-mp3-downloader-api.p.rapidapi.com';
const RAPIDAPI_SPOTIFY_HOST = process.env.RAPIDAPI_SPOTIFY_HOST || RAPIDAPI_HOST_OVERRIDE || 'spotify-music-mp3-downloader-api.p.rapidapi.com';
const YOUTUBE_URL_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
const SPOTIFY_URL_RE = /^https?:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+/i;
let youtubeDl;
let youtubeDlReady;

async function getYoutubeDl() {
    if (!youtubeDl) youtubeDl = require('youtube-dl-exec');
    if (!youtubeDlReady) {
        youtubeDlReady = (async () => {
            const binaryPath = youtubeDl.constants?.YOUTUBE_DL_PATH
                || path.join(path.dirname(require.resolve('youtube-dl-exec')), '..', 'bin', 'yt-dlp');
            if (!fs.existsSync(binaryPath)) {
                fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
                const response = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', {
                    redirect: 'follow',
                    signal: AbortSignal.timeout(90_000),
                    headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
                });
                if (!response.ok) throw new Error(`yt-dlp bootstrap HTTP ${response.status}`);
                const binary = Buffer.from(await response.arrayBuffer());
                if (binary.length < 100_000 || binary.subarray(0, 2).toString() === '<!') {
                    throw new Error('yt-dlp bootstrap returned an invalid binary');
                }
                fs.writeFileSync(binaryPath, binary, { mode: 0o755 });
            }
            try { fs.chmodSync(binaryPath, 0o755); } catch (_) {}
            return youtubeDl;
        })().catch(error => {
            youtubeDlReady = null;
            throw error;
        });
    }
    await youtubeDlReady;
    return youtubeDl;
}

function safeFileName(value) {
    return String(value || 'audio').replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 100) || 'audio';
}

function normalizeYoutubeUrl(value) {
    const input = String(value || '').trim();
    const match = input.match(YOUTUBE_URL_RE);
    return match ? `https://www.youtube.com/watch?v=${match[1]}` : input;
}

async function prexzyJson(pathname, params) {
    const url = new URL(`${PREXZY_API}${pathname}`);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, String(value));
    const response = await fetch(url, {
        signal: AbortSignal.timeout(45_000),
        headers: { Accept: 'application/json', 'User-Agent': 'SUKUNA-MD/3.0' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === false) throw new Error(payload.error || `Prexzy HTTP ${response.status}`);
    return payload;
}

async function eliteJson(pathname, params) {
    const url = new URL(`${ELITE_API}${pathname}`);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, String(value));
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { Accept: 'application/json', 'User-Agent': 'SUKUNA-MD/3.0' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false || payload.status === false) throw new Error(payload.error || payload.message || `EliteProTech HTTP ${response.status}`);
    return payload;
}

async function resolveWithElite(query) {
    const payload = await eliteJson('/search/ytsearch', { q: query });
    const result = payload.results?.videos?.[0];
    if (!result?.url) throw new Error('EliteProTech returned no YouTube result');
    return {
        url: normalizeYoutubeUrl(result.url),
        title: result.title || query,
        author: result.author?.name || 'YouTube',
        duration: result.duration || '',
        thumbnail: result.thumbnail || '',
    };
}

async function resolveWithPrexzy(query) {
    const apple = await prexzyJson('/search/applemusic', { q: query });
    const appleTrack = (apple.data || []).find(item => /music\.apple\.com/i.test(item.link || '') && /[?&]i=/.test(item.link || '')) || apple.data?.[0];
    const searchText = [appleTrack?.title, String(appleTrack?.artist || '').replace(/^Song\s*[·-]\s*/i, '')].filter(Boolean).join(' ') || query;
    const youtube = await prexzyJson('/search/youtube', { q: searchText });
    const result = (youtube.data || []).find(item => /youtube\.com|youtu\.be/i.test(item.link || ''));
    if (!result?.link) throw new Error('Prexzy returned no YouTube result');
    return {
        url: normalizeYoutubeUrl(result.link),
        title: result.title || appleTrack?.title || query,
        author: result.channel || appleTrack?.artist || 'YouTube',
        duration: result.duration || '',
        thumbnail: result.imageUrl || appleTrack?.image || '',
    };
}

async function resolveSpotify(input) {
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(input)}`, { signal: AbortSignal.timeout(20_000) });
    const data = await response.json();
    if (!response.ok || !data.title) throw new Error('Spotify metadata lookup failed');
    const title = String(data.title).trim();
    const author = String(data.author_name || 'Spotify').trim();
    let video = {};
    try { video = await resolveWithElite(`${title} ${author}`); }
    catch (_) { try { video = await resolveWithPrexzy(`${title} ${author}`); } catch (_) {} }
    return { ...video, spotifyUrl: input, title, author, thumbnail: data.thumbnail_url || video.thumbnail || '' };
}

async function resolveVideo(input) {
    if (SPOTIFY_URL_RE.test(input)) return resolveSpotify(input);
    if (!YOUTUBE_URL_RE.test(input)) {
        try { return await resolveWithElite(input); }
        catch (error) { console.warn('[play] EliteProTech search failed:', error.message); }
        try { return await resolveWithPrexzy(input); }
        catch (error) { console.warn('[play] Prexzy search failed:', error.message); }
    }
    const source = YOUTUBE_URL_RE.test(input) ? normalizeYoutubeUrl(input) : `ytsearch1:${input}`;
    const ytdlp = await getYoutubeDl();
    const raw = await ytdlp(source, {
        dumpSingleJson: true,
        skipDownload: true,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
        extractorArgs: 'youtube:player_client=android',
    }, { timeout: YT_DLP_TIMEOUT_MS });
    const metadata = raw?.entries?.[0] || raw;
    if (!metadata?.webpage_url && !metadata?.url && !metadata?.id) throw new Error('YouTube returned no video metadata');
    const id = metadata.id || source.match(/[?&]v=([A-Za-z0-9_-]{6,})/)?.[1];
    const url = metadata.webpage_url || (id ? `https://www.youtube.com/watch?v=${id}` : source);
    return {
        url,
        title: metadata.title || input,
        author: metadata.uploader || metadata.channel || 'YouTube',
        duration: metadata.duration_string || (metadata.duration ? `${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}` : ''),
        thumbnail: metadata.thumbnail || '',
    };
}

async function getRapidSpotifyMedia(spotifyUrl) {
    const key = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || RAPIDAPI_KEY_OVERRIDE;
    if (!key) throw new Error('RAPIDAPI_KEY is not configured on the bot host');
    const endpoint = `https://${RAPIDAPI_SPOTIFY_HOST}/downloadMusic?link=${encodeURIComponent(spotifyUrl)}`;
    let response;
    try {
        response = await fetch(endpoint, {
            signal: AbortSignal.timeout(90_000),
            headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_SPOTIFY_HOST, Accept: 'application/json,*/*' },
        });
    } catch (error) {
        throw new Error(`RapidAPI request failed: ${error.message}`);
    }
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (type.includes('audio/') || type.includes('application/octet-stream')) return { buffer: Buffer.from(await response.arrayBuffer()), mimetype: type.split(';')[0] || 'audio/mpeg' };
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); } catch (_) { payload = {}; }
    if (!response.ok) throw new Error(payload.message || payload.error || `RapidAPI Spotify HTTP ${response.status}`);
    const direct = payload.downloadUrl || payload.download_url || payload.download || payload.url || payload.link || payload.data?.downloadUrl || payload.data?.download_url || payload.data?.download || payload.data?.url || payload.data?.link || (raw.trim().startsWith('http') ? raw.trim() : '');
    if (!/^https?:\/\//i.test(String(direct || ''))) throw new Error(payload.message || payload.error || 'RapidAPI returned no audio URL');
    return { url: direct };
}

async function getDirectUrl(url, formats, type) {
    let lastError;
    try {
        const payload = await eliteJson(`/download/${type === 'mp3' ? 'ytmp3' : 'ytmp4'}`, { url });
        const direct = payload.download?.downloadUrl || payload.result?.url || payload.downloadUrl || payload.url;
        if (/^https?:\/\//i.test(String(direct || ''))) return direct;
        throw new Error('EliteProTech returned no media URL');
    } catch (error) {
        lastError = error;
        console.warn('[play] EliteProTech download failed:', error.message);
    }
    try {
        const payload = await prexzyJson(type === 'mp3' ? '/download/ytmp3' : '/download/ytmp4', { url });
        if (/^https?:\/\//i.test(payload.download_url || '')) return payload.download_url;
        throw new Error('Prexzy returned no download URL');
    } catch (error) {
        lastError = error;
        console.warn('[play] Prexzy download failed:', error.message);
    }
    for (const format of formats) {
        try {
            const ytdlp = await getYoutubeDl();
            const result = await ytdlp(url, {
                getUrl: true,
                format,
                noWarnings: true,
                noCheckCertificates: true,
                extractorArgs: 'youtube:player_client=android',
            }, { timeout: YT_DLP_TIMEOUT_MS });
            const direct = String(result || '').trim().split(/\r?\n/).pop();
            if (/^https?:\/\//i.test(direct)) return direct;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('YouTube did not return a downloadable format');
}

async function fetchBuffer(url, maxBytes) {
    let response;
    try {
        response = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(90_000),
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
        });
    } catch (error) {
        throw new Error(`media URL request failed: ${error.message}`);
    }
    if (!response.ok) throw new Error(`YouTube media HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > maxBytes) throw new Error('The selected media is too large for WhatsApp');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('YouTube returned an empty media stream');
    const chunks = [];
    let total = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error('The selected media is too large for WhatsApp');
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
}

async function convertToMp3(inputBuffer) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sukuna-play-'));
    const input = path.join(dir, 'input.media');
    const output = path.join(dir, 'output.mp3');
    fs.writeFileSync(input, inputBuffer, { mode: 0o600 });
    try {
        await new Promise((resolve, reject) => {
            const encoder = ffmpegPath && fs.existsSync(ffmpegPath) ? ffmpegPath : 'ffmpeg';
            const child = spawn(encoder, ['-y', '-i', input, '-vn', '-codec:a', 'libmp3lame', '-b:a', '128k', output], { stdio: ['ignore', 'ignore', 'pipe'] });
            let errorText = '';
            child.stderr.on('data', data => { errorText += data.toString().slice(-4000); });
            child.once('error', reject);
            child.once('close', code => code === 0 ? resolve() : reject(new Error(`MP3 conversion failed (${code}): ${errorText.slice(-500)}`)));
        });
        const result = fs.readFileSync(output);
        if (!result.length || result.length > MAX_AUDIO_BYTES) throw new Error('Converted audio is too large for WhatsApp');
        return result;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function fetchThumbnailBuffer(url) {
    if (!/^https?:\/\//i.test(String(url || ''))) return null;
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
        const type = String(response.headers.get('content-type') || '').toLowerCase();
        if (!response.ok || !type.includes('image/')) return null;
        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer.length <= 5 * 1024 * 1024 ? buffer : null;
    } catch (_) { return null; }
}

async function sendSongPreview({ sock, msg, from, video }) {
    const body = [
        `🎬 *${video.title}*`,
        video.author ? `👤 ${video.author}` : '',
        video.duration ? `⏱️ ${video.duration}` : '',
        '',
        'Choose a format to download:',
    ].filter(Boolean).join('\n');
    const thumbnail = await fetchThumbnailBuffer(video.thumbnail);
    if (thumbnail) await sock.sendMessage(from, { image: thumbnail, caption: body }, { quoted: msg });
    else await sock.sendMessage(from, { text: body }, { quoted: msg });
}

async function downloadAndSend({ sock, msg, from, selection, type }) {
    const title = selection.title || 'audio';
    if (type === 'mp3' && selection.spotifyUrl) {
        const rapid = await getRapidSpotifyMedia(selection.spotifyUrl);
        const audio = rapid.buffer || await fetchBuffer(rapid.url, MAX_AUDIO_BYTES);
        await sock.sendMessage(from, { audio, mimetype: rapid.mimetype || 'audio/mpeg', fileName: `${safeFileName(title)}.mp3`, ptt: false }, { quoted: msg });
        return;
    }
    const source = await getDirectUrl(selection.url, type === 'mp3' ? ['18', 'best'] : ['18', 'best[height<=360]', 'best'], type);
    const sourceBuffer = await fetchBuffer(source, type === 'mp3' ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES);
    if (type === 'mp3') {
        const audio = await convertToMp3(sourceBuffer);
        await sock.sendMessage(from, { audio, mimetype: 'audio/mpeg', fileName: `${safeFileName(title)}.mp3`, ptt: false }, { quoted: msg });
    } else {
        await sock.sendMessage(from, { video: sourceBuffer, mimetype: 'video/mp4', fileName: `${safeFileName(title)}.mp4`, caption: `🎬 *${title}*\n\n> SUKUNA MD` }, { quoted: msg });
    }
}

module.exports = {
    name: 'play',
    aliases: ['song', 'music', 'audio'],
    description: 'Search YouTube and choose MP3 or MP4 from a rich preview',
    usage: '.play <song name or URL>',
    category: 'media',
    async execute({ sock, msg, from, args, reply, prefix = '.' }) {
        const query = args.join(' ').trim();
        if (!query) return reply('🎵 *Usage:* .play <song name or YouTube URL>\n*Example:* .play Essence Wizkid');
        await reply(`🔍 Searching YouTube for: *${query}*...`);
        await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }).catch(() => {});
        try {
            const video = await resolveVideo(query);
            await sendSongPreview({ sock, msg, from, video });
            await downloadAndSend({ sock, msg, from, selection: video, type: 'mp3' });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (error) {
            console.error('[play] resolve error:', error.stderr || error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply('❌ I could not find or prepare that YouTube media right now. Try another title or link.');
        }
    },
};

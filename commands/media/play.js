'use strict';

const axios = require('axios');

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function safeFileName(value) {
    return String(value || 'audio').replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 100) || 'audio';
}

async function fetchAudioBuffer(url) {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('Provider returned an invalid audio URL');
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60_000,
        maxContentLength: MAX_AUDIO_BYTES,
        maxRedirects: 6,
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'audio/mpeg,audio/*,application/octet-stream;q=0.8,*/*;q=0.5' },
        validateStatus: () => true,
    });
    const buffer = Buffer.from(response.data || '');
    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    if (response.status < 200 || response.status >= 300) throw new Error(`Audio download HTTP ${response.status}`);
    if (!buffer.length || contentType.includes('text/html') || contentType.includes('application/json')) throw new Error('Provider returned an invalid audio response');
    return buffer;
}

async function fetchThumbnailBuffer(url) {
    if (!/^https?:\/\//i.test(String(url || ''))) return null;
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15_000,
            maxContentLength: 5 * 1024 * 1024,
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/jpeg,image/*;q=0.8,*/*;q=0.5' },
            validateStatus: () => true,
        });
        const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
        if (response.status >= 200 && response.status < 300 && contentType.includes('image/')) return Buffer.from(response.data);
    } catch (error) {
        console.warn('[play] thumbnail unavailable:', error.message);
    }
    return null;
}

module.exports = {
    name: 'play',
    aliases: ['song', 'music', 'audio'],
    description: 'Search and download a song as audio',
    usage: '.play <song name or URL>',
    category: 'media',

    async execute({ sock, msg, from, args, reply, t }) {
        const tr = t || ((key, vars) => {
            const fallbacks = {
                'play.noQuery': '🎵 *Usage:* .play <song name>\n*Example:* .play Essence Wizkid',
                'play.searching': '🔍 Searching: *' + (vars?.query || '') + '*...',
                'play.downloading': '⬇️ Downloading: *' + (vars?.title || '') + '*...',
                'play.notFound': '❌ Could not find: *' + (vars?.query || '') + '*',
                'play.downloadFail': '❌ Download failed.',
                'play.success': '✅ *' + (vars?.title || '') + '*\n🎵 Enjoy!',
                'play.thumbCaption': '🎵 *' + (vars?.title || '') + '*',
            };
            return fallbacks[key] || key;
        });

        const query = args.join(' ').trim();
        if (!query) {
            return reply(tr('play.noQuery'));
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        const strategies = [
            // Strategy 1: Primary API provided by user
            async () => {
                const { data } = await axios.get(`https://apis.davidcyril.name.ng/play?query=${encodeURIComponent(query)}`, { timeout: 30000 });
                if (data.status && data.result?.download_url) {
                    return {
                        url: data.result.download_url,
                        title: data.result.title,
                        thumbnail: data.result.thumbnail,
                        duration: data.result.duration,
                        author: data.result.author || data.result.artist || data.result.channel || 'YouTube',
                        sourceUrl: data.result.url || ''
                    };
                }
                throw new Error('Primary API failed');
            },
            // Strategy 2: Fallback search + ytmp3 from same provider
            async () => {
                const searchRes = await axios.get(`https://apis.davidcyril.name.ng/youtube/search?query=${encodeURIComponent(query)}`, { timeout: 15000 });
                const video = searchRes.data?.results?.[0];
                if (!video?.url) throw new Error('Search failed');

                const dlRes = await axios.get(`https://apis.davidcyril.name.ng/download/ytmp3?url=${encodeURIComponent(video.url)}`, { timeout: 30000 });
                if (dlRes.data.success && dlRes.data.result?.download_url) {
                    return {
                        url: dlRes.data.result.download_url,
                        title: video.title,
                        thumbnail: video.thumbnail,
                        duration: video.duration,
                        author: video.author || 'YouTube',
                        sourceUrl: video.url
                    };
                }
                throw new Error('Secondary API failed');
            },
            // Strategy 3: Another free API (agatz.xyz)
            async () => {
                const { data } = await axios.get(`https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(query)}`, { timeout: 30000 }).catch(() => ({ data: {} }));
                if (data.status === 200 && data.data?.downloadUrl) {
                    return {
                        url: data.data.downloadUrl,
                        title: data.data.title || query,
                        thumbnail: data.data.thumbnail,
                        duration: data.data.duration,
                        author: data.data.author || data.data.artist || data.data.channel || 'YouTube',
                        sourceUrl: video.url
                    };
                }
                throw new Error('Agatz API failed');
            }
        ];

        for (const strategy of strategies) {
            try {
                const res = await strategy();
                if (res?.url) {
                    const audioBuffer = await fetchAudioBuffer(res.url);
                    const thumbnailBuffer = await fetchThumbnailBuffer(res.thumbnail);
                    const title = res.title || query;
                    const author = res.author || 'YouTube';
                    const duration = res.duration || '';
                    const audioMessage = {
                        audio: audioBuffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${safeFileName(title)}.mp3`,
                        ptt: false,
                        contextInfo: {
                            externalAdReply: {
                                title,
                                body: `${author}${duration ? ` • ${duration}` : ''}`,
                                ...(thumbnailBuffer ? { thumbnail: thumbnailBuffer } : {}),
                                ...(res.thumbnail ? { thumbnailUrl: res.thumbnail } : {}),
                                mediaType: 2,
                                renderLargerThumbnail: true,
                                showAdAttribution: false,
                                ...(res.sourceUrl ? { sourceUrl: res.sourceUrl } : {}),
                            },
                        },
                    };
                    await sock.sendMessage(from, audioMessage, { quoted: msg });

                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                    return;
                }
            } catch (e) {
                console.error('Strategy failed:', e.message);
                continue;
            }
        }

        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        return reply(tr('play.notFound', { query }));
    }
};

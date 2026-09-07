/**
 * .ss2 — Short website screen recording via snapshot.xwolf.space
 * Usage: .ss2 https://example.com [desktop|mobile]
 */

const RECORD_API = 'https://snapshot.xwolf.space/api/record';
const VIDEO_HOST = 'snapshot.xwolf.space';
const CAPTURE_TIMEOUT_MS = 120000;
const DOWNLOAD_TIMEOUT_MS = 120000;
const VIDEO_POLL_INTERVAL_MS = 2000;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

function normalizeUrl(input) {
    if (!input) return null;
    let value = String(input).trim();
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        if (!url.hostname || !url.hostname.includes('.')) return null;
        return url.toString();
    } catch {
        return null;
    }
}

function timeoutSignal(milliseconds) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), milliseconds);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function downloadVideo(videoUrl, sessionCookie = '') {
    const parsed = new URL(videoUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== VIDEO_HOST) {
        throw new Error('recording API returned an untrusted video URL');
    }

    const timeout = timeoutSignal(DOWNLOAD_TIMEOUT_MS);
    try {
        while (!timeout.signal.aborted) {
            const response = await fetch(parsed, {
                signal: timeout.signal,
                headers: {
                    Accept: 'video/mp4, video/*;q=0.9',
                    'User-Agent': 'SukunaMD/3.0',
                    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
                },
            });

            if (response.status === 404) {
                const body = await response.text();
                // The API can report `completed` before its MP4 storage is ready.
                if (/video not ready/i.test(body)) {
                    await new Promise(resolve => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
                    continue;
                }
            }
            if (!response.ok) throw new Error(`video download returned HTTP ${response.status}`);

            const length = Number(response.headers.get('content-length') || 0);
            if (length > MAX_VIDEO_BYTES) throw new Error('recording is larger than WhatsApp upload limit');

            const buffer = Buffer.from(await response.arrayBuffer());
            if (!buffer.length) throw new Error('recording was empty');
            if (buffer.length > MAX_VIDEO_BYTES) throw new Error('recording is larger than WhatsApp upload limit');
            return buffer;
        }
        throw new Error('recording video was not ready before the download timeout');
    } finally {
        timeout.clear();
    }
}

module.exports = {
    name: 'ss2',
    aliases: ['screenrecord', 'webrecord'],
    description: 'Record a short website screen video. Usage: .ss2 <url> [desktop|mobile]',
    category: 'media',

    async execute({ sock, msg, from, reply, args }) {
        const target = normalizeUrl(args[0]);
        const viewport = String(args[1] || 'desktop').toLowerCase();
        if (!target || !['desktop', 'mobile'].includes(viewport)) {
            return reply(
                '❓ Usage: *.ss2 <url> [desktop|mobile]*\n' +
                'Example: .ss2 https://example.com desktop'
            );
        }

        const timeout = timeoutSignal(CAPTURE_TIMEOUT_MS);
        try {
            await reply(`🎥 Recording *${target}* (${viewport}) ... please wait`);
            const apiUrl = new URL(RECORD_API);
            apiUrl.searchParams.set('siteUrl', target);
            apiUrl.searchParams.set('viewport', viewport);

            const response = await fetch(apiUrl, {
                signal: timeout.signal,
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'SukunaMD/3.0',
                },
            });
            // The API scopes the generated video to the sid cookie returned by
            // /api/record. Preserve it for the subsequent /api/videos request.
            const sessionCookie = (response.headers.get('set-cookie') || '').split(';')[0];
            const contentType = response.headers.get('content-type') || '';
            let data = null;
            if (contentType.includes('application/json')) data = await response.json();
            else data = { error: (await response.text()).slice(0, 300) };

            if (!response.ok) {
                return reply(`⚠️ Recording API returned status ${response.status}.`);
            }
            if (data?.status && data.status !== 'completed') {
                return reply(`⚠️ Recording did not complete: ${data.status}`);
            }
            if (data?.error) return reply(`⚠️ Recording failed: ${data.error}`);
            if (!data?.videoUrl || typeof data.videoUrl !== 'string') {
                return reply('⚠️ Recording API did not return a video URL.');
            }

            const video = await downloadVideo(data.videoUrl, sessionCookie);
            await sock.sendMessage(from, {
                video,
                mimetype: 'video/mp4',
                caption: `🎥 Website recording of ${target}\n⏱️ ${data.duration || 'short'} seconds`,
            }, { quoted: msg });
        } catch (error) {
            if (error.name === 'AbortError') {
                return reply('⏱️ Website recording timed out. Try a simpler or faster website.');
            }
            return reply(`⚠️ Website recording failed: ${error.message}`);
        } finally {
            timeout.clear();
        }
    },
};

module.exports.normalizeUrl = normalizeUrl;
module.exports.downloadVideo = downloadVideo;

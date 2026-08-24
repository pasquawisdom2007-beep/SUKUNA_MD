/**
 * nsfwFetch — shared helper for NSFW media endpoints.
 *
 * Resilience: the original single provider (prexzyvilla) is frequently down,
 * so we now try a CHAIN of endpoints per category and use the first that
 * returns a usable media URL. All keyless mirrors (nekobot, waifu.pics) need
 * no API key. If every provider fails, callers fail gracefully.
 */
'use strict';
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const ffmpegStaticPath = require('ffmpeg-static');
const ffmpegPath = ffmpegStaticPath && fs.existsSync(ffmpegStaticPath) ? ffmpegStaticPath : 'ffmpeg';
const execFileAsync = promisify(execFile);

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i;
const VID_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const URL_RE = /^https?:\/\//i;
const MEDIA_CONTENT_RE = /^(image|video|audio)\//i;

function walk(node, out) {
    if (!node) return;
    if (typeof node === 'string') {
        if (URL_RE.test(node) && (IMG_RE.test(node) || VID_RE.test(node))) out.push(node);
        return;
    }
    if (Array.isArray(node)) { for (const v of node) walk(v, out); return; }
    if (typeof node === 'object') { for (const v of Object.values(node)) walk(v, out); }
}

function bufferLooksLikeImage(buffer) {
    return Buffer.isBuffer(buffer) && (
        buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]) || Buffer.alloc(0))
        || buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        || buffer.subarray(0, 6).toString('ascii') === 'GIF87a'
        || buffer.subarray(0, 6).toString('ascii') === 'GIF89a'
        || buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    );
}

function bufferLooksLikeVideo(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp' || buffer.subarray(0, 4).toString('ascii') === '\x1aE\xdf\xa3';
}

function parseJsonBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!text || !/^[\[{]/.test(text)) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
}

async function convertGifToMp4(buffer) {
    if (!Buffer.isBuffer(buffer) || !ffmpegPath) throw new Error('GIF-to-video converter is unavailable');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sukuna-nsfw-'));
    const inputPath = path.join(tempDir, 'input.gif');
    const outputPath = path.join(tempDir, 'output.mp4');
    try {
        fs.writeFileSync(inputPath, buffer);
        await execFileAsync(ffmpegPath, [
            '-y', '-v', 'error', '-i', inputPath,
            '-vf', 'fps=15,scale=ceil(iw/2)*2:ceil(ih/2)*2',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', '-t', '20', outputPath,
        ], { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
        const output = fs.readFileSync(outputPath);
        if (!bufferLooksLikeVideo(output)) throw new Error('FFmpeg produced an invalid MP4');
        return output;
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

async function fetchFromEndpoint(endpoint, { timeout = 20000 } = {}) {
    const r = await axios.get(endpoint, {
        timeout,
        responseType: 'arraybuffer',
        maxContentLength: 64 * 1024 * 1024,
        maxBodyLength: 64 * 1024 * 1024,
        headers: { 'User-Agent': 'Mozilla/5.0 (SUKUNA-MD)', Accept: '*/*' },
        validateStatus: () => true,
    });
    if (r.status >= 400) throw new Error(`API ${r.status}`);

    const buffer = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data || '');
    const contentType = String(r.headers?.['content-type'] || '').split(';')[0].toLowerCase();
    if (MEDIA_CONTENT_RE.test(contentType) || bufferLooksLikeImage(buffer) || bufferLooksLikeVideo(buffer)) {
        const isGif = contentType === 'image/gif' || buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
        return { buffer, isVideo: contentType.startsWith('video/') || bufferLooksLikeVideo(buffer), isGif, mimeType: contentType || (isGif ? 'image/gif' : 'application/octet-stream') };
    }

    const payload = parseJsonBuffer(buffer);
    const urls = [];
    walk(payload, urls);
    if (!urls.length) throw new Error('No media URL or binary media in response');
    const url = urls[0];
    return { url, isVideo: VID_RE.test(url), isGif: /\.gif(?:\?|$)/i.test(url), mimeType: '' };
}

/**
 * Try each endpoint in order (accepts a single string or an array) and return
 * the first usable media. Throws only if ALL candidates fail.
 */
async function fetchMedia(endpoints, opts) {
    const list = Array.isArray(endpoints) ? endpoints : [endpoints];
    let lastErr = new Error('No endpoints provided');
    for (const ep of list) {
        if (!ep) continue;
        try {
            return await fetchFromEndpoint(ep, opts);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

// Map a category to keyless mirror endpoints that support it.
// nekobot.xyz covers most NSFW categories; waifu.pics covers a few.
const NEKOBOT_TYPES = new Set([
    'hass', 'hmidriff', '4k', 'hentai', 'hneko', 'hkitsune', 'kemonomimi',
    'anal', 'hanal', 'gonewild', 'ass', 'pussy', 'thigh', 'hthigh',
    'paizuri', 'tentacle', 'boobs', 'hboobs', 'yaoi', 'cum', 'blowjob', 'feet',
]);
const WAIFU_TYPES = new Set(['waifu', 'neko', 'trap', 'blowjob']);

// Aliases so callers' labels line up with mirror category names.
const CATEGORY_ALIASES = {
    tits: 'boobs', boobs: 'boobs', ass: 'ass', pussy: 'pussy',
    fuck: 'anal', sixtynine: 'blowjob', cum: 'cum', bj: 'blowjob',
};

function mirrorsFor(category) {
    if (!category) return [];
    const c = CATEGORY_ALIASES[category] || category;
    const out = [];
    if (NEKOBOT_TYPES.has(c)) out.push(`https://nekobot.xyz/api/image?type=${c}`);
    if (WAIFU_TYPES.has(c)) out.push(`https://api.waifu.pics/nsfw/${c}`);
    return out;
}

// Derive the category slug from a prexzyvilla-style endpoint URL tail.
function categoryFromEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return '';
    const m = endpoint.match(/\/([a-z0-9]+)\/?(?:\?|$)/i);
    return m ? m[1].toLowerCase() : '';
}

function makeNsfwCommand({ name, aliases = [], endpoint, category, emoji = '🔞', label, timeout = 20000, convertGif = true }) {
    const title = label || name.toUpperCase();
    const cat = (category || categoryFromEndpoint(endpoint) || name).toLowerCase();
    // Build the resilient endpoint chain: original first, then keyless mirrors.
    const endpoints = [endpoint, ...mirrorsFor(cat)].filter(Boolean);

    return {
        name,
        aliases,
        description: `${title} (18+) — random NSFW media`,
        category: '18plus',
        nsfw: true,
        async execute({ sock, msg, from, reply, args }) {
            if (args[0] === 'help' || args[0] === '?') {
                return reply(
                    `${emoji} *${title}* (18+)\n\n` +
                    `Usage: .${name}\n` +
                    `Sends a random ${title.toLowerCase()} NSFW media.\n\n` +
                    `⚠️ For 18+ chats only.`
                );
            }
            try {
                await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
                const media = await fetchMedia(endpoints, { timeout });
                const caption = `${emoji} *${title}*\n\n> SUKUNA MD • 18+`;
                if (media.buffer) {
                    let buffer = media.buffer;
                    let mimetype = media.mimeType || 'video/mp4';
                    let gifPlayback = Boolean(media.isGif);
                    if (media.isGif && convertGif) {
                        buffer = await convertGifToMp4(buffer);
                        mimetype = 'video/mp4';
                        gifPlayback = false;
                    }
                    if (media.isVideo || media.isGif) {
                        await sock.sendMessage(from, {
                            video: buffer,
                            mimetype,
                            gifPlayback,
                            caption,
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, {
                            image: media.buffer,
                            mimetype: media.mimeType || undefined,
                            caption,
                        }, { quoted: msg });
                    }
                } else if (media.isVideo) {
                    await sock.sendMessage(from, { video: { url: media.url }, mimetype: 'video/mp4', caption }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { image: { url: media.url }, caption }, { quoted: msg });
                }
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                console.error(`[${name}] error:`, err.message);
                try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch {}
                reply(`❌ ${title} is temporarily unavailable (all providers down). Try again later.`);
            }
        },
    };
}

module.exports = { fetchMedia, makeNsfwCommand, mirrorsFor };

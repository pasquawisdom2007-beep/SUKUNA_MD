'use strict';

const path = require('path');
const { resolveMedia, downloadResolvedMedia, fetchUrlBuffer } = require('../../utils/mediaCommand');
const { normalizeHttpUrl, prefixOf, truncate } = require('../../utils/commandHelpers');

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/3gpp']);

function extensionFor(mimetype, original = '') {
    const known = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
        'image/bmp': '.bmp', 'image/avif': '.avif', 'video/mp4': '.mp4', 'video/webm': '.webm',
        'video/quicktime': '.mov', 'video/x-matroska': '.mkv', 'video/3gpp': '.3gp',
    };
    return known[mimetype] || path.extname(original).split('?')[0].slice(0, 8) || '.bin';
}

function usableType(mimetype, filename = '') {
    const type = String(mimetype || '').split(';')[0].toLowerCase();
    if (IMAGE_TYPES.has(type) || VIDEO_TYPES.has(type)) return type;
    const extension = path.extname(filename).toLowerCase();
    if (/\.(jpe?g|png|gif|webp|bmp|avif)$/.test(extension)) return 'image/jpeg';
    if (/\.(mp4|webm|mov|m4v|mkv|3gp)$/.test(extension)) return 'video/mp4';
    return null;
}

async function uploadTmpfiles(buffer, filename, mimetype) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimetype }), filename);
    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST', body: form, signal: AbortSignal.timeout(45_000),
        headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
    });
    if (!response.ok) throw new Error(`tmpfiles.org returned HTTP ${response.status}`);
    const data = await response.json();
    const pageUrl = data?.data?.url;
    if (!pageUrl) throw new Error('tmpfiles.org returned no URL');
    return pageUrl.replace('://tmpfiles.org/', '://tmpfiles.org/dl/');
}

async function uploadUguu(buffer, filename, mimetype) {
    const form = new FormData();
    form.append('files[]', new Blob([buffer], { type: mimetype }), filename);
    const response = await fetch('https://uguu.se/upload.php', {
        method: 'POST', body: form, signal: AbortSignal.timeout(45_000),
        headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
    });
    if (!response.ok) throw new Error(`uguu.se returned HTTP ${response.status}`);
    const data = await response.json();
    const url = data?.files?.[0]?.url;
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('uguu.se returned no URL');
    return url;
}

async function uploadPublic(buffer, filename, mimetype) {
    const errors = [];
    for (const uploader of [uploadTmpfiles, uploadUguu]) {
        try { return await uploader(buffer, filename, mimetype); }
        catch (error) { errors.push(error.message); }
    }
    throw new Error(errors.join(' | '));
}

module.exports = {
    name: 'url',
    aliases: ['uploadurl', 'mediaurl', 'toupload'],
    description: 'Turn a replied or linked image/video into a public temporary URL',
    usage: '.url (reply to image/video) or .url <direct media URL>',
    category: 'media',

    async execute({ sock, msg, reply, args, prefix }) {
        const px = prefixOf(prefix);
        const linked = normalizeHttpUrl(args?.[0]);
        const found = resolveMedia(msg);
        if (!linked && (!found || !['image', 'video'].includes(found.type))) {
            return reply(`🌐 *Media URL*\n\nReply to an image or video with ${px}url.\nYou can also use ${px}url <direct image/video URL>.\n\nThe returned link is public and temporary.`);
        }
        try {
            let buffer;
            let mimetype;
            let filename;
            let source;
            if (linked) {
                const downloaded = await fetchUrlBuffer(linked.toString(), MAX_UPLOAD_BYTES);
                mimetype = usableType(downloaded.contentType, downloaded.finalUrl);
                if (!mimetype) return reply('❌ The URL did not return a supported image or video.');
                buffer = downloaded.buffer;
                source = downloaded.finalUrl;
                filename = `sukuna-${Date.now()}${extensionFor(mimetype, downloaded.finalUrl)}`;
            } else {
                const media = await downloadResolvedMedia(sock, msg, found);
                mimetype = usableType(media.node?.mimetype, media.node?.fileName || '')
                    || (found.type === 'image' ? 'image/jpeg' : 'video/mp4');
                buffer = media.buffer;
                filename = media.node?.fileName || `sukuna-${Date.now()}${extensionFor(mimetype)}`;
                source = `replied ${found.type}`;
            }
            if (buffer.length > MAX_UPLOAD_BYTES) return reply('❌ Media exceeds the 30 MB public-upload limit.');
            const url = await uploadPublic(buffer, filename, mimetype);
            return reply(
                '✅ *Public Media URL*\n' +
                `Type: ${mimetype}\n` +
                `Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n` +
                `Source: ${truncate(source, 220)}\n` +
                `URL: ${url}\n\n` +
                '_Anyone with the link may be able to access the file while the host keeps it._'
            );
        } catch (error) {
            console.error('[url]', error.message);
            return reply(`❌ Public upload failed: ${truncate(error.message, 320)}`);
        }
    },
};

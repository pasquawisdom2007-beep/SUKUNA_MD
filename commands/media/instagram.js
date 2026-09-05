'use strict';

const axios = require('axios');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const INSTAGRAM_APP_ID = '936619743392459';
const JSON_TIMEOUT_MS = 20_000;
const COLD_START_TIMEOUT_MS = 55_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_MEDIA_BYTES = 90 * 1024 * 1024;
const MIN_MEDIA_BYTES = 512;

function isInstagramUrl(value) { return typeof value === 'string' && /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\//i.test(value.trim()); }
function isHttpUrl(value) { return typeof value === 'string' && /^https?:\/\//i.test(value.trim()); }

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

async function fromReelApi(postUrl) {
    const data = await getJson('https://instagram-reel-api.onrender.com/', { params: { url: postUrl }, timeout: COLD_START_TIMEOUT_MS });
    const mediaUrl = data?.download_link;
    if (!isHttpUrl(mediaUrl)) throw new Error('no download_link in response');
    return { mediaUrl, caption: String(data?.title || data?.description || '').trim(), author: '', provider: 'reel-api' };
}

async function fromVercelDownloader(postUrl) {
    const data = await getJson('https://instagram-reels-downloader-tau.vercel.app/api/video', { params: { postUrl, enhanced: 'true' } });
    const payload = data?.data || {};
    const medias = Array.isArray(payload.medias) ? payload.medias : [];
    const bestMedia = medias.find(m => m?.type === 'video' && isHttpUrl(m?.url)) || medias.find(m => isHttpUrl(m?.url));
    const mediaUrl = bestMedia?.url || (isHttpUrl(payload.videoUrl) ? payload.videoUrl : '');
    if (!isHttpUrl(mediaUrl)) throw new Error('no usable media url in response');
    return { mediaUrl, caption: String(payload.title || '').trim(), author: String(payload.author || payload.owner?.username || '').trim(), isVideo: bestMedia ? bestMedia.type === 'video' : true, provider: 'vercel-downloader' };
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
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: DOWNLOAD_TIMEOUT_MS, maxContentLength: MAX_MEDIA_BYTES, maxRedirects: 6, headers: { 'User-Agent': USER_AGENT, Accept: 'video/mp4,image/*,application/octet-stream;q=0.8,*/*;q=0.5' }, validateStatus: () => true });
    const buffer = Buffer.from(response.data || '');
    const contentType = response.headers?.['content-type'] || '';
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status} downloading media`);
    if (buffer.length < MIN_MEDIA_BYTES) throw new Error('downloaded file is empty or too small');
    if (!looksLikeMedia(buffer, contentType)) throw new Error(`downloaded file is not image/video (content-type: ${contentType || 'unknown'})`);
    const isVideo = contentType.includes('video/') || buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    return { buffer, isVideo };
}

async function resolveAndDownload(postUrl) {
    const providers = [['reel-api', fromReelApi], ['vercel-downloader', fromVercelDownloader]];
    let lastError = null;
    for (const [name, provider] of providers) {
        try {
            const info = await provider(postUrl);
            const { buffer, isVideo } = await downloadBinary(info.mediaUrl);
            return { buffer, isVideo, caption: info.caption, author: info.author, provider: name };
        } catch (error) {
            lastError = error;
            console.error(`[instagram] ${name} failed:`, error.message);
        }
    }
    throw lastError || new Error('No provider returned usable media');
}

function usernameFromInput(value) {
    const raw = String(value || '').trim().replace(/^@/, '');
    if (!raw) return '';
    try {
        if (/^https?:\/\//i.test(raw)) return (new URL(raw).pathname.split('/').filter(Boolean)[0] || '').replace(/^@/, '').toLowerCase();
    } catch (_) {}
    return raw.split(/[?/#]/)[0].toLowerCase();
}
function validUsername(username) { return /^[a-z0-9._]{1,30}$/i.test(username); }
function count(value) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString('en-US') : '—'; }
function pickUser(payload) { return payload?.data?.user || payload?.user || payload?.graphql?.user || null; }

function normalizeUser(user, username) {
    const timeline = user?.edge_owner_to_timeline_media || user?.edge_felix_video_timeline || {};
    const posts = (timeline.edges || []).map(edge => edge?.node).filter(Boolean).slice(0, 6);
    return {
        username: user.username || username,
        fullName: user.full_name || user.fullName || user.name || username,
        biography: user.biography || user.bio || '',
        followers: user.edge_followed_by?.count ?? user.follower_count ?? user.followersCount,
        following: user.edge_follow?.count ?? user.following_count ?? user.followingsCount,
        postsCount: timeline.count ?? user.media_count ?? user.postsCount,
        verified: Boolean(user.is_verified ?? user.isVerified),
        private: Boolean(user.is_private ?? user.isPrivate),
        avatar: user.profile_pic_url_hd || user.profile_pic_url || user.avatar || '',
        externalUrl: user.external_url || user.website || '',
        posts: posts.map(post => ({ shortcode: post.shortcode || post.code || '', image: post.display_url || post.thumbnail_src || post.display_resources?.at(-1)?.src || '', isVideo: Boolean(post.is_video || post.isVideo) })),
    };
}

async function getInstagramJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*', 'x-ig-app-id': INSTAGRAM_APP_ID, 'x-requested-with': 'XMLHttpRequest' } });
        const text = await response.text();
        let body = null;
        try { body = JSON.parse(text); } catch (_) {}
        if (!response.ok) throw new Error(body?.message || `Instagram returned HTTP ${response.status}`);
        return body;
    } finally { clearTimeout(timer); }
}

async function lookupInstagramUser(username) {
    const endpoint = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    try {
        const user = pickUser(await getInstagramJson(endpoint));
        if (user) return normalizeUser(user, username);
    } catch (error) { console.warn('[insta] web profile endpoint:', error.message); }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT_MS);
    try {
        const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' } });
        const html = await response.text();
        if (!response.ok || !html) throw new Error(`Instagram profile page unavailable (HTTP ${response.status})`);
        const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || '';
        const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || '';
        const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)?.[1] || '';
        if (!title || /^instagram(?:\s*[|·-].*)?$/i.test(title) || (!description && !image)) throw new Error('Instagram returned a login or rate-limit page');
        return normalizeUser({ username, full_name: title.replace(/\s*[|·].*$/, '').trim(), biography: description, profile_pic_url: image }, username);
    } finally { clearTimeout(timer); }
}

function profileText(profile) {
    const verified = profile.verified ? ' ✓' : '';
    const visibility = profile.private ? 'Private account' : 'Public account';
    const bio = profile.biography ? `\n\n${profile.biography.slice(0, 500)}` : '';
    const website = profile.externalUrl ? `\n🔗 ${profile.externalUrl}` : '';
    return `📸 *Instagram profile*\n\n@${profile.username}${verified}\n*${profile.fullName}*\n\n${count(profile.postsCount)} posts · ${count(profile.followers)} followers · ${count(profile.following)} following\n${visibility}${bio}${website}`;
}
function recentPostsText(profile) {
    if (!profile.posts.length) return '';
    return `\n\n*Recent posts*\n${profile.posts.map((post, i) => `${i + 1}. ${post.isVideo ? 'video' : 'photo'}${post.shortcode ? ` — https://www.instagram.com/p/${post.shortcode}/` : ''}`).join('\n')}`;
}

module.exports = {
    name: 'instagram',
    aliases: ['insta', 'ig', 'igdl', 'iguser', 'profile'],
    description: 'Look up public Instagram profiles or download post media',
    category: 'media',
    async execute({ sock, msg, from, reply, args }) {
        const input = String(args?.[0] || '').trim();
        if (!input) return reply('📸 Usage: .insta <username> or .instagram <post/reel URL>');

        if (isInstagramUrl(input)) {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
            try {
                const { buffer, isVideo, caption, author } = await resolveAndDownload(input);
                const captionText = [isVideo ? '📸 *Instagram Video*' : '📸 *Instagram Photo*', author ? `👤 ${author}` : '', caption ? `\n${caption.slice(0, 400)}` : ''].filter(Boolean).join('\n');
                if (isVideo) await sock.sendMessage(from, { video: buffer, mimetype: 'video/mp4', caption: captionText }, { quoted: msg });
                else await sock.sendMessage(from, { image: buffer, caption: captionText }, { quoted: msg });
                return sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            } catch (error) {
                console.error('[instagram download]', error.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
                return reply('❌ Could not download that Instagram post right now. It may be private, invalid, or temporarily blocked.');
            }
        }

        const username = usernameFromInput(input);
        if (!validUsername(username)) return reply('📸 Use a valid Instagram username such as `.insta kfc`.');
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
        try {
            const profile = await lookupInstagramUser(username);
            const caption = `${profileText(profile)}${recentPostsText(profile)}\n\n🔗 https://www.instagram.com/${profile.username}/`;
            if (profile.avatar && isHttpUrl(profile.avatar)) await sock.sendMessage(from, { image: { url: profile.avatar }, caption }, { quoted: msg });
            else await reply(caption);
            return sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (error) {
            console.error('[instagram profile]', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply(`❌ I could not read @${username} right now. Instagram may be rate-limiting public lookups, or the profile may be private/unavailable.`);
        }
    },
};

module.exports.resolveAndDownload = resolveAndDownload;
module.exports.lookupInstagramUser = lookupInstagramUser;
module.exports.normalizeUser = normalizeUser;
module.exports.usernameFromInput = usernameFromInput;

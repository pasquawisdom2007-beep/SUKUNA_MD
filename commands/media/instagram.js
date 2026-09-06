'use strict';

const axios = require('axios');
const { sendRichHtml, escapeHtml } = require('../../utils/genaiRich');

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
    return { mediaUrl, caption: String(data?.title || data?.description || '').trim(), author: '' };
}

async function fromVercelDownloader(postUrl) {
    const data = await getJson('https://instagram-reels-downloader-tau.vercel.app/api/video', { params: { postUrl, enhanced: 'true' } });
    const payload = data?.data || {};
    const medias = Array.isArray(payload.medias) ? payload.medias : [];
    const bestMedia = medias.find(m => m?.type === 'video' && isHttpUrl(m?.url)) || medias.find(m => isHttpUrl(m?.url));
    const mediaUrl = bestMedia?.url || (isHttpUrl(payload.videoUrl) ? payload.videoUrl : '');
    if (!isHttpUrl(mediaUrl)) throw new Error('no usable media url in response');
    return { mediaUrl, caption: String(payload.title || '').trim(), author: String(payload.author || payload.owner?.username || '').trim(), isVideo: bestMedia ? bestMedia.type === 'video' : true };
}

function looksLikeMedia(buffer, contentType) {
    const type = String(contentType || '').toLowerCase();
    if (type.includes('text/html') || type.includes('application/json')) return false;
    if (type.includes('video/') || type.includes('image/')) return true;
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp' || buffer[0] === 0xff && buffer[1] === 0xd8 || buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

async function downloadBinary(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: DOWNLOAD_TIMEOUT_MS, maxContentLength: MAX_MEDIA_BYTES, maxRedirects: 6, headers: { 'User-Agent': USER_AGENT, Accept: 'video/mp4,image/*,application/octet-stream;q=0.8,*/*;q=0.5' }, validateStatus: () => true });
    const buffer = Buffer.from(response.data || '');
    const contentType = response.headers?.['content-type'] || '';
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status} downloading media`);
    if (buffer.length < MIN_MEDIA_BYTES) throw new Error('downloaded file is empty or too small');
    if (!looksLikeMedia(buffer, contentType)) throw new Error(`downloaded file is not image/video (content-type: ${contentType || 'unknown'})`);
    return { buffer, isVideo: contentType.includes('video/') || buffer.subarray(4, 8).toString('ascii') === 'ftyp' };
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
    try { if (/^https?:\/\//i.test(raw)) return (new URL(raw).pathname.split('/').filter(Boolean)[0] || '').replace(/^@/, '').toLowerCase(); } catch (_) {}
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

async function lookupPrexzy(username) {
    const response = await fetch(`https://prexzyapis.com/stalk/igstalkV2?user=${encodeURIComponent(username)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Prexzy HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.status || !payload?.data) throw new Error('Prexzy profile was not found');
    const data = payload.data;
    return {
        username: usernameFromInput(data.username || username),
        fullName: data.name || username,
        biography: data.bio || data.biography || '',
        followers: data.followers,
        following: data.following,
        postsCount: data.uploads,
        engagement: data.engagement,
        verified: Boolean(data.verified),
        private: false,
        avatar: data.avatar || data.profilePic || data.profile_pic || '',
        externalUrl: data.profileUrl || `https://instagram.com/${encodeURIComponent(username)}`,
        profileUrl: data.profileUrl || `https://instagram.com/${encodeURIComponent(username)}`,
        posts: Array.isArray(data.posts) ? data.posts : [],
    };
}

async function getInstagramJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*', 'x-ig-app-id': INSTAGRAM_APP_ID, 'x-requested-with': 'XMLHttpRequest' } });
        const text = await response.text();
        let body = null; try { body = JSON.parse(text); } catch (_) {}
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
    throw new Error('Instagram profile unavailable');
}

function stat(value) { const text = String(value ?? '').trim(); return text ? escapeHtml(text) : '—'; }

function instagramRichCard(profile) {
    const username = usernameFromInput(profile.username || 'instagram');
    const handle = `@${username}`;
    const name = escapeHtml(profile.fullName || profile.name || username);
    const profileUrl = profile.profileUrl || profile.externalUrl || `https://instagram.com/${encodeURIComponent(username)}`;
    const avatar = profile.avatar || `https://unavatar.io/instagram/${encodeURIComponent(username)}`;
    const description = profile.biography || `Instagram profile for ${handle}. Tap View profile to open it on Instagram.`;
    const posts = (profile.posts || []).filter(post => post?.image && post?.shortcode).slice(0, 6).map(post => `<a class="post" href="https://instagram.com/p/${escapeHtml(post.shortcode)}/"><img src="${escapeHtml(post.image)}" alt="Instagram post"></a>`).join('');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;background:#050708;font-family:Arial,sans-serif}body{padding:8px;background:radial-gradient(circle at 50% 0%,#30213d,#071014 70%);color:#f4f4f4}.card{overflow:hidden;border:1px solid #343d43;border-radius:24px;background:linear-gradient(160deg,#162126,#0b1115 62%,#11181d);box-shadow:0 10px 30px #000b}.top{padding:18px 18px 10px;display:flex;gap:13px;align-items:center}.avatar{width:68px;height:68px;border-radius:50%;object-fit:cover;border:3px solid #e1306c;background:#252d31}.identity{min-width:0}.name{font-size:23px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.handle{color:#a8b5ba;font-size:14px;margin-top:4px}.verified{color:#3897f0;font-size:17px}.stats{display:flex;gap:8px;padding:5px 18px 14px;color:#dbe4e7;font-size:12px}.stat{flex:1;text-align:center;padding:9px 4px;border:1px solid #354148;border-radius:12px;background:#121b20}.stat b{display:block;color:#fff;font-size:15px;margin-bottom:2px}.bio{padding:0 18px 16px;color:#d0d9dc;font-size:14px;line-height:1.4}.actions{display:flex;gap:10px;padding:0 18px 18px}.button{display:block;flex:1;text-align:center;text-decoration:none;padding:13px 8px;border-radius:13px;font-weight:700;font-size:13px}.primary{background:linear-gradient(90deg,#e1306c,#f77737);color:#fff}.secondary{border:1px solid #53616a;color:#e8eef0;background:#1a2429}.more{margin:0 18px 18px;padding:13px;border-radius:13px;background:#111a1f;color:#bbc7cb;font-size:13px;line-height:1.4}.more summary{color:#54a9ff;cursor:pointer;font-weight:700}.posts{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:0 18px 18px}.post{display:block;height:92px;overflow:hidden;border-radius:8px;background:#202a2f}.post img{width:100%;height:100%;object-fit:cover}.footer{text-align:center;padding:12px;color:#819096;font-size:11px;border-top:1px solid #29363d}.ig{color:#f77737}</style></head><body><section class="card"><div class="top"><img class="avatar" src="${escapeHtml(avatar)}" alt="Instagram profile"><div class="identity"><div class="name">${name} <span class="verified">${profile.verified ? '✓' : '●'}</span></div><div class="handle">${escapeHtml(handle)}</div></div></div><div class="stats"><div class="stat"><b>${stat(profile.postsCount)}</b>posts</div><div class="stat"><b>${stat(profile.followers)}</b>followers</div><div class="stat"><b>${stat(profile.following || profile.engagement)}</b>${profile.following ? 'following' : 'engagement'}</div></div><div class="bio">${escapeHtml(description)}</div><div class="actions"><a class="button primary" href="${escapeHtml(profileUrl)}">◎ View profile</a><a class="button secondary" href="${escapeHtml(profileUrl)}">Open Instagram</a></div>${posts ? `<div class="posts">${posts}</div>` : ''}<details class="more"><summary>See more</summary><div style="margin-top:9px">Profile: ${escapeHtml(handle)}<br>URL: ${escapeHtml(profileUrl)}</div></details><div class="footer"><span class="ig">Instagram</span> lookup · SUKUNA MD</div></section></body></html>`;
}

module.exports = {
    name: 'instagram',
    aliases: ['insta', 'ig', 'igdl', 'iguser', 'igstalk', 'profile'],
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
            let profile;
            try { profile = await lookupPrexzy(username); }
            catch (prexzyError) { console.warn('[insta] Prexzy lookup:', prexzyError.message); profile = await lookupInstagramUser(username); }
            await sendRichHtml({ sock, jid: from, quoted: msg, html: instagramRichCard(profile) });
            return sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (error) {
            console.error('[instagram profile]', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply(`❌ I could not read @${username} right now. The profile may be private, unavailable, or rate-limited.`);
        }
    },
};

module.exports.resolveAndDownload = resolveAndDownload;
module.exports.lookupInstagram = lookupPrexzy;
module.exports.lookupInstagramUser = lookupInstagramUser;
module.exports.instagramRichCard = instagramRichCard;
module.exports.normalizeUser = normalizeUser;
module.exports.usernameFromInput = usernameFromInput;

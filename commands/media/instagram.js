'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');
const { escapeHtml } = require('../../utils/genaiRich');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const INSTAGRAM_APP_ID = '936619743392459';
const JSON_TIMEOUT_MS = 20_000;
const COLD_START_TIMEOUT_MS = 55_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_MEDIA_BYTES = 90 * 1024 * 1024;
const MIN_MEDIA_BYTES = 512;

function isInstagramUrl(value) { return typeof value === 'string' && /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:p|reel|reels|tv|share\/reel)\//i.test(value.trim()); }
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

function htmlDecode(value) {
    return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
}

function metaContent(html, property) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
    return htmlDecode(match?.[1] || '');
}

async function fromInstagramPage(postUrl) {
    const response = await axios.get(postUrl, {
        timeout: JSON_TIMEOUT_MS,
        maxContentLength: 8 * 1024 * 1024,
        maxRedirects: 5,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        validateStatus: () => true,
    });
    const html = String(response.data || '');
    if (response.status < 200 || response.status >= 300 || !html) throw new Error(`Instagram page HTTP ${response.status}`);
    const mediaUrl = metaContent(html, 'og:video') || metaContent(html, 'twitter:player:stream') ||
        html.match(/"video_url"\s*:\s*"(https?:\\?[^"\\]+)"/i)?.[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    const imageUrl = metaContent(html, 'og:image');
    const resolvedUrl = isHttpUrl(mediaUrl) ? mediaUrl : (isHttpUrl(imageUrl) ? imageUrl : '');
    if (!resolvedUrl) throw new Error('Instagram page contained no public media URL');
    return { mediaUrl: resolvedUrl, caption: metaContent(html, 'og:description'), author: '', isVideo: Boolean(mediaUrl), provider: 'instagram-page' };
}

async function fromVercelDownloader(postUrl) {
    const data = await getJson('https://instagram-reels-downloader-tau.vercel.app/api/video', { params: { postUrl, url: postUrl, enhanced: 'true' } });
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
    const cleanUrl = String(postUrl).trim().replace(/[?#].*$/, '');
    const providers = [
        ['instagram-page', fromInstagramPage],
        ['vercel-downloader', fromVercelDownloader],
        ['reel-api', fromReelApi],
    ];
    let lastError = null;
    for (const [name, provider] of providers) {
        try {
            const info = await provider(cleanUrl);
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
    const description = profile.biography || `Instagram profile for ${handle}. Open the profile to see the latest posts and account details.`;
    const posts = (profile.posts || []).filter(post => post?.image && post?.shortcode).slice(0, 6).map(post => `<a class="post" href="https://instagram.com/p/${escapeHtml(post.shortcode)}/"><img src="${escapeHtml(post.image)}" alt="Instagram post"><span class="post-icon">◎</span></a>`).join('');
    const related = posts ? `<div class="section-title">Related posts</div><div class="post-grid">${posts}</div><div class="section-title recent">${escapeHtml(username)}'s recent posts</div><div class="post-grid">${posts}</div>` : '';

    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:#05090b;font-family:Arial,sans-serif}body{padding:0;background:#05090b;color:#f0f4f5}.sheet{min-height:100vh;padding:10px 22px 26px;background:#101a1f;border-radius:28px 28px 0 0}.handlebar{width:48px;height:4px;margin:0 auto 25px;border-radius:6px;background:#d8e0e2}.avatar-wrap{text-align:center}.avatar{width:92px;height:92px;border-radius:50%;object-fit:cover;border:3px solid #ee335c;background:#202a2f}.identity{text-align:center;margin-top:10px}.name{font-size:27px;font-weight:400;color:#f4f7f8}.verified{color:#2698ee;font-size:21px;margin-left:4px}.stats{text-align:center;margin-top:18px;color:#f2f5f6;font-size:16px}.bio{text-align:center;margin-top:18px;color:#e5eaec;font-size:17px;line-height:1.35}.actions{margin-top:22px}.button{display:block;text-align:center;text-decoration:none;padding:17px 10px;border-radius:32px;font-size:17px;font-weight:500}.primary{background:#20d268;color:#eefcf2}.description{margin-top:31px;color:#edf2f3;font-size:17px;line-height:1.42}.section-title{margin-top:30px;margin-bottom:12px;color:#9ca8ad;font-size:15px}.recent{margin-top:26px}.post-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;overflow:hidden}.post{position:relative;display:block;height:190px;overflow:hidden;border-radius:8px;background:#1b262b}.post img{width:100%;height:100%;object-fit:cover}.post-icon{position:absolute;left:12px;bottom:11px;color:#fff;font-size:21px;text-shadow:0 1px 4px #000}.footer{text-align:center;margin-top:26px;color:#78888f;font-size:12px}
</style></head><body><section class="sheet"><div class="handlebar"></div><div class="avatar-wrap"><img class="avatar" src="${escapeHtml(avatar)}" alt="Instagram profile"></div><div class="identity"><span class="name">${name}</span><span class="verified">${profile.verified ? '●' : '●'}</span></div><div class="stats">${stat(profile.postsCount)} posts · ${stat(profile.followers)} followers · ${stat(profile.following || profile.engagement)} ${profile.following ? 'following' : 'engagement'}</div><div class="bio">${escapeHtml(profile.biographyShort || profile.shortBio || profile.fullName || name)}</div><div class="actions"><a class="button primary" href="${escapeHtml(profileUrl)}">◎&nbsp;&nbsp;View profile</a></div><div class="description">${escapeHtml(description)}</div>${related}<div class="footer">Instagram · SUKUNA MD</div></section></body></html>`;
}


function instagramProfileData(profile, expanded = false) {
    const username = usernameFromInput(profile.username || 'instagram');
    const profileUrl = profile.profileUrl || profile.externalUrl || `https://instagram.com/${encodeURIComponent(username)}`;
    const avatar = profile.avatar || `https://unavatar.io/instagram/${encodeURIComponent(username)}`;
    const displayName = profile.fullName || profile.name || username;
    const stats = `${profile.postsCount || '—'} posts · ${profile.followers || '—'} followers · ${profile.following || profile.engagement || '—'} ${profile.following ? 'following' : 'engagement'}`;
    const sections = [
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'FOATextPrimitive', text: expanded ? `${displayName}\n@${username}` : `@${username}` } },
        },
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'GenAIImagePrimitive', preview_image: { __typename: 'GenAIMediaItem', mime_type: 'image/jpeg', url: avatar }, full_image: { __typename: 'GenAIMediaItem', mime_type: 'image/jpeg', url: avatar } } },
        },
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'FOATextPrimitive', text: expanded ? `${stats}\n\n${profile.biography || profile.fullName || ''}` : displayName } },
        },
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAIActionRowLayoutViewModel',
                primitives: [{
                    __typename: 'GenAI3PExtWidgetPrimitive',
                    header: { __typename: 'GenAI3PExtWidgetStandardHeader', title: expanded ? 'Instagram' : 'Profile' },
                    body: { __typename: 'GenAI3PExtCalendarEventList', ctas: [{
                        label: expanded ? 'Open profile' : 'View profile',
                        state: 'PENDING',
                        kind: 'OTHER',
                        tool_call_id: expanded ? undefined : `instagram:profile:${username}`,
                        cta_type: expanded ? 'OPEN_URL' : undefined,
                        cta_url: expanded ? profileUrl : undefined,
                        toast: { label: expanded ? 'Opening Instagram' : `Loading @${username}`, __typename: 'GenAI3PExtWidgetToast' },
                        __typename: 'GenAI3PExtWidgetCTA',
                    }], sections: [] },
                }],
            },
        },
    ];

    if (expanded) {
        sections.push({ __typename: 'GenAIUnifiedResponseSection', view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'FOATextPrimitive', text: profile.description || `About @${username}\n\n${profile.biography || 'No public biography was returned.'}` } } });
        const posts = (profile.posts || []).filter(post => post?.image && post?.shortcode).slice(0, 8);
        if (posts.length) {
            sections.push({ __typename: 'GenAIUnifiedResponseSection', view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'FOATextPrimitive', text: 'Related posts' } } });
            for (const post of posts) {
                sections.push({ __typename: 'GenAIUnifiedResponseSection', view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'GenAIImagePrimitive', preview_image: { __typename: 'GenAIMediaItem', mime_type: 'image/jpeg', url: post.image }, full_image: { __typename: 'GenAIMediaItem', mime_type: 'image/jpeg', url: post.image } } } });
            }
        }
    }
    return { sections };
}

function buildInstagramContent(profile, expanded = false) {
    const data = Buffer.from(JSON.stringify(instagramProfileData(profile, expanded))).toString('base64');
    return proto.Message.fromObject({
        messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {}, messageSecret: crypto.randomBytes(32) },
        botForwardedMessage: { message: { richResponseMessage: { messageType: 1, submessages: [], unifiedResponse: { data }, contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 } } } },
    });
}

async function sendInstagramRich({ sock, jid, quoted, profile, expanded = false }) {
    const content = buildInstagramContent(profile, expanded);
    const wrapped = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted: quoted?.message ? quoted : undefined });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
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
            await sendInstagramRich({ sock, jid: from, quoted: msg, profile, expanded: false });
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
module.exports.instagramProfileData = instagramProfileData;
module.exports.buildInstagramContent = buildInstagramContent;
module.exports.sendInstagramRich = sendInstagramRich;
module.exports.normalizeUser = normalizeUser;
module.exports.usernameFromInput = usernameFromInput;

'use strict';

const axios = require('axios');

const REQUEST_TIMEOUT_MS = 20000;
const TIKTOK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.tiktok.com/',
};

function cleanUsername(value) {
    return String(value || '')
        .trim()
        .replace(/^@+/, '')
        .replace(/^https?:\/\/(?:www\.)?tiktok\.com\/@?/i, '')
        .split(/[/?#\s]/, 1)[0]
        .replace(/[^a-zA-Z0-9._-]/g, '');
}

function firstValue(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

function numberValue(value) {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : value;
}

function extractJsonScript(html, scriptId) {
    const escapedId = scriptId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `<script\\b[^>]*\\bid=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
        'i'
    );
    const match = String(html || '').match(pattern);
    if (!match?.[1]) return null;
    try {
        return JSON.parse(match[1].trim());
    } catch (_) {
        return null;
    }
}

function normalizeProfile(info, requestedUsername) {
    if (!info || typeof info !== 'object') return null;
    const user = info.user || info;
    const stats = info.statsV2 || info.stats || {};
    const handle = firstValue(user.uniqueId, user.unique_id, requestedUsername);
    if (!handle && !user.nickname) return null;

    return {
        nickname: firstValue(user.nickname, handle, requestedUsername),
        handle,
        bio: firstValue(user.signature, user.bio, '') || '',
        verified: user.verified === true || user.verified === 1 || user.verified === 'true',
        avatar: firstValue(user.avatarLarger, user.avatarMedium, user.avatarThumb, user.avatar),
        followers: numberValue(stats.followerCount ?? stats.followers),
        following: numberValue(stats.followingCount ?? stats.following),
        likes: numberValue(stats.heartCount ?? stats.heart ?? stats.likes),
        videos: numberValue(stats.videoCount ?? stats.videos),
    };
}

function profileInfoFromPage(html, requestedUsername) {
    const universal = extractJsonScript(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__');
    const scope = universal?.__DEFAULT_SCOPE__;
    const universalInfo = scope?.['webapp.user-detail']?.userInfo ||
        scope?.webapp?.['user-detail']?.userInfo;
    const universalProfile = normalizeProfile(universalInfo, requestedUsername);
    if (universalProfile) return universalProfile;

    const legacy = extractJsonScript(html, 'SIGI_STATE');
    const legacyInfo = legacy?.UserModule?.users?.[requestedUsername] ||
        legacy?.ItemModule?.[requestedUsername];
    return normalizeProfile(legacyInfo, requestedUsername);
}

async function scrapePublicProfile(username) {
    const response = await axios.get(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
        headers: TIKTOK_HEADERS,
        responseType: 'text',
    });
    if (response.status < 200 || response.status >= 300) return null;
    return profileInfoFromPage(response.data, username);
}

async function queryTikwm(username) {
    const response = await axios.get('https://www.tikwm.com/api/user/info', {
        params: { unique_id: username },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
        headers: { 'User-Agent': TIKTOK_HEADERS['User-Agent'], Accept: 'application/json' },
    });
    const data = response.data;
    if (!data || data.code !== 0 || !data.data) return null;
    return normalizeProfile(data.data, username);
}

async function fetchTikTokProfile(rawUsername) {
    const username = cleanUsername(rawUsername);
    if (!username) return null;

    // TikTok’s public profile HTML currently exposes structured profile data.
    // It avoids the tikwm endpoint’s Cloudflare 403 while requiring no API key.
    try {
        const profile = await scrapePublicProfile(username);
        if (profile) return profile;
    } catch (_) {
        // Try the secondary provider below.
    }

    try {
        return await queryTikwm(username);
    } catch (_) {
        return null;
    }
}

module.exports = {
    cleanUsername,
    fetchTikTokProfile,
    profileInfoFromPage,
};

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const loadedGplay = require('google-play-scraper');
const gplay = loadedGplay.default || loadedGplay;

const LANG = process.env.PLAYSTORE_LANG || 'en';
const COUNTRY = process.env.PLAYSTORE_COUNTRY || 'us';
const MAX_RESULTS = 5;
const SEARCH_TTL = 10 * 60 * 1000;
const DETAIL_TTL = 15 * 60 * 1000;
const MAX_APK_BYTES = 200 * 1024 * 1024;
const searchSessions = new Map();
const searchCache = new Map();
const detailCache = new Map();

const CATEGORY_ALIASES = {
    apps: 'APPLICATION',
    application: 'APPLICATION',
    art: 'ART_AND_DESIGN',
    automotive: 'AUTO_AND_VEHICLES',
    books: 'BOOKS_AND_REFERENCE',
    business: 'BUSINESS',
    communication: 'COMMUNICATION',
    dating: 'DATING',
    education: 'EDUCATION',
    entertainment: 'ENTERTAINMENT',
    finance: 'FINANCE',
    food: 'FOOD_AND_DRINK',
    health: 'HEALTH_AND_FITNESS',
    lifestyle: 'LIFESTYLE',
    maps: 'MAPS_AND_NAVIGATION',
    medical: 'MEDICAL',
    music: 'MUSIC_AND_AUDIO',
    news: 'NEWS_AND_MAGAZINES',
    personalization: 'PERSONALIZATION',
    photography: 'PHOTOGRAPHY',
    productivity: 'PRODUCTIVITY',
    shopping: 'SHOPPING',
    social: 'SOCIAL',
    sports: 'SPORTS',
    tools: 'TOOLS',
    travel: 'TRAVEL_AND_LOCAL',
    video: 'VIDEO_PLAYERS',
    weather: 'WEATHER',
    game: 'GAME',
    games: 'GAME',
    action: 'GAME_ACTION',
    adventure: 'GAME_ADVENTURE',
    arcade: 'GAME_ARCADE',
    board: 'GAME_BOARD',
    card: 'GAME_CARD',
    casino: 'GAME_CASINO',
    casual: 'GAME_CASUAL',
    educational: 'GAME_EDUCATIONAL',
    puzzle: 'GAME_PUZZLE',
    racing: 'GAME_RACING',
    'role-playing': 'GAME_ROLE_PLAYING',
    rpg: 'GAME_ROLE_PLAYING',
    simulation: 'GAME_SIMULATION',
    strategy: 'GAME_STRATEGY',
    trivia: 'GAME_TRIVIA',
    word: 'GAME_WORD',
};

function clip(value, max = 700) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeText(value) {
    return String(value || '').replace(/[\\*_`]/g, '\\$&');
}

function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'Unknown';
    return new Intl.NumberFormat('en-US', { notation: number >= 1000000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(number);
}

function formatDate(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Not published';
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(timestamp));
}

function normalizeUrl(value) {
    if (!value) return '';
    const text = String(value);
    return text.startsWith('//') ? `https:${text}` : text;
}

function playUrl(appId) {
    return `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=${LANG}&gl=${COUNTRY}`;
}

function normalizeApp(app) {
    if (!app || !app.appId) return null;
    return {
        ...app,
        appId: String(app.appId),
        title: clip(app.title || app.appId, 160),
        developer: clip(app.developer || 'Unknown developer', 120),
        summary: clip(app.summary || app.description || 'No summary published.', 300),
        icon: normalizeUrl(app.icon),
        url: app.url || playUrl(app.appId),
    };
}

function cacheGet(map, key) {
    const item = map.get(key);
    if (!item || item.expiresAt < Date.now()) {
        map.delete(key);
        return null;
    }
    return item.value;
}

function cacheSet(map, key, value, ttl) {
    map.set(key, { value, expiresAt: Date.now() + ttl });
    if (map.size > 300) {
        const oldest = map.keys().next().value;
        if (oldest) map.delete(oldest);
    }
    return value;
}

async function gplayCall(method, options) {
    if (typeof gplay[method] !== 'function') throw new Error(`Google Play operation ${method} is unavailable`);
    return gplay[method]({
        lang: LANG,
        country: COUNTRY,
        throttle: 1,
        ...options,
    });
}

async function searchApps(term, num = MAX_RESULTS) {
    const clean = clip(term, 120);
    if (!clean) return [];
    const key = `${LANG}:${COUNTRY}:search:${clean.toLowerCase()}:${num}`;
    const cached = cacheGet(searchCache, key);
    if (cached) return cached;
    const apps = await gplayCall('search', { term: clean, num, fullDetail: false });
    return cacheSet(searchCache, key, (Array.isArray(apps) ? apps : []).map(normalizeApp).filter(Boolean), SEARCH_TTL);
}

async function getApp(appId) {
    const clean = String(appId || '').trim();
    if (!clean) throw new Error('missing app package name');
    const cached = cacheGet(detailCache, `${LANG}:${COUNTRY}:app:${clean}`);
    if (cached) return cached;
    const app = normalizeApp(await gplayCall('app', { appId: clean }));
    if (!app) throw new Error('Google Play returned no app details');
    return cacheSet(detailCache, `${LANG}:${COUNTRY}:app:${clean}`, app, DETAIL_TTL);
}

function extractAppId(input) {
    const value = decodeURIComponent(String(input || '').trim());
    if (!value) return '';
    try {
        const url = new URL(value);
        if (url.hostname.endsWith('play.google.com')) return url.searchParams.get('id') || '';
    } catch (_) {}
    const match = value.match(/(?:^|[?&])id=([A-Za-z0-9._-]+)/i);
    if (match) return match[1];
    if (/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_-]+)+$/.test(value)) return value;
    return '';
}

function sessionKey(from, sender) {
    return `${from || 'unknown'}:${sender || 'unknown'}`;
}

function rememberSearch(from, sender, apps) {
    searchSessions.set(sessionKey(from, sender), { apps, expiresAt: Date.now() + SEARCH_TTL });
    if (searchSessions.size > 300) searchSessions.delete(searchSessions.keys().next().value);
}

function getRememberedApp(from, sender, selector) {
    const state = searchSessions.get(sessionKey(from, sender));
    if (!state || state.expiresAt < Date.now()) return null;
    const index = Number(selector);
    if (Number.isInteger(index) && index >= 1 && index <= state.apps.length) return state.apps[index - 1];
    const appId = extractAppId(selector);
    return appId ? state.apps.find(app => app.appId === appId) || { appId } : null;
}

async function resolveApp(args, context) {
    const raw = args.join(' ').trim();
    if (!raw) throw new Error('provide an app name, package name, Google Play link, or a result number');
    const firstToken = args[0];
    const remembered = args.length === 1 ? getRememberedApp(context.from, context.sender, firstToken) : null;
    if (remembered) return getApp(remembered.appId);
    const directId = extractAppId(raw);
    if (directId) return getApp(directId);
    const results = await searchApps(raw, 3);
    if (!results.length) throw new Error(`no Google Play apps found for “${clip(raw, 90)}”`);
    return getApp(results[0].appId);
}

async function resolveTwoApps(args, context) {
    const separator = args.findIndex(arg => /^(vs|versus)$/i.test(arg));
    if (separator < 1 || separator >= args.length - 1) throw new Error('use: appcompare <app one> vs <app two>');
    const left = await resolveApp(args.slice(0, separator), context);
    const right = await resolveApp(args.slice(separator + 1), context);
    return [left, right];
}

function appLine(app, index) {
    const score = app.scoreText || (app.score ? Number(app.score).toFixed(1) : 'N/A');
    const price = app.priceText || (app.free ? 'Free' : 'Paid / see listing');
    return `${index}. *${escapeText(app.title)}*\n   ${escapeText(app.developer)} · ${score}★ · ${escapeText(price)}\n   ID: \`${app.appId}\``;
}

function appLinkBlock(app) {
    return `Play Store: ${app.url || playUrl(app.appId)}`;
}

async function sendImageOrReply(context, imageUrl, caption) {
    if (imageUrl && context.sock?.sendMessage) {
        try {
            return await context.sock.sendMessage(context.from, { image: { url: imageUrl }, caption }, { quoted: context.msg });
        } catch (_) {}
    }
    return context.reply(caption);
}

function semverParts(value) {
    const match = String(value || '').match(/\d+(?:\.\d+){0,3}/);
    return match ? match[0].split('.').map(Number) : null;
}

function compareVersions(a, b) {
    const left = semverParts(a);
    const right = semverParts(b);
    if (!left || !right) return null;
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const difference = (left[index] || 0) - (right[index] || 0);
        if (difference) return difference > 0 ? 1 : -1;
    }
    return 0;
}

function categoryId(input) {
    const key = String(input || '').toLowerCase().replace(/_/g, '-');
    return CATEGORY_ALIASES[key] || (Object.values(CATEGORY_ALIASES).includes(String(input || '').toUpperCase()) ? String(input).toUpperCase() : '');
}

async function listApps(category) {
    const key = `${LANG}:${COUNTRY}:top:${category || 'all'}`;
    const cached = cacheGet(searchCache, key);
    if (cached) return cached;
    const options = { collection: gplay.collection?.TOP_FREE || 'TOP_FREE', num: MAX_RESULTS, fullDetail: false };
    if (category) options.category = category;
    const apps = await gplayCall('list', options);
    return cacheSet(searchCache, key, (Array.isArray(apps) ? apps : []).map(normalizeApp).filter(Boolean), SEARCH_TTL);
}

function getCollections(database, phoneNumber) {
    if (!database?.data || !phoneNumber) return {};
    if (!database.data.users) database.data.users = {};
    if (!database.data.users[phoneNumber]) database.data.users[phoneNumber] = {};
    if (!database.data.users[phoneNumber].appCollections) database.data.users[phoneNumber].appCollections = {};
    return database.data.users[phoneNumber].appCollections;
}

function saveUserData(database) {
    if (typeof database?.save === 'function') database.save('users');
}

async function runCollection(context) {
    const { args, database, phoneNumber } = context;
    const action = String(args[0] || 'list').toLowerCase();
    const collections = getCollections(database, phoneNumber);
    if (action === 'list') {
        const names = Object.keys(collections);
        return context.reply(names.length ? `🗂️ *APP COLLECTIONS*\n\n${names.map((name, i) => `${i + 1}. ${name} (${collections[name].length} apps)`).join('\n')}\n\nUse your prefix with appcollection show <name>.` : '🗂️ You have no app collections yet. Use appcollection create <name> <app>.');
    }
    if (action === 'delete' || action === 'remove') {
        const name = args.slice(1).join(' ').trim().toLowerCase();
        if (!name || !collections[name]) return context.reply('Use: appcollection delete <name>');
        delete collections[name];
        saveUserData(database);
        return context.reply(`🗑️ Deleted collection “${name}”.`);
    }
    if (action === 'show' || action === 'view') {
        const name = args.slice(1).join(' ').trim().toLowerCase();
        const apps = collections[name];
        if (!apps) return context.reply(`Collection “${name}” was not found.`);
        const lines = apps.map((app, i) => `${i + 1}. *${escapeText(app.title)}* · ${escapeText(app.developer)}\n   ${app.url || playUrl(app.appId)}`);
        return context.reply(`🗂️ *${name.toUpperCase()}*\n\n${lines.join('\n') || 'This collection is empty.'}`);
    }
    if (action === 'create' || action === 'add') {
        const name = String(args[1] || '').trim().toLowerCase();
        if (!name || !args.slice(2).length) return context.reply(`Use: appcollection ${action} <name> <app>`);
        const app = await resolveApp(args.slice(2), context);
        if (!collections[name]) collections[name] = [];
        if (!collections[name].some(item => item.appId === app.appId)) collections[name].push({ appId: app.appId, title: app.title, developer: app.developer, url: app.url || playUrl(app.appId) });
        collections[name] = collections[name].slice(0, 50);
        saveUserData(database);
        return context.reply(`✅ Added *${escapeText(app.title)}* to collection “${name}”. It now has ${collections[name].length} app(s).`);
    }
    return context.reply('Use: appcollection list | create <name> <app> | add <name> <app> | show <name> | delete <name>');
}

async function runApkScan(context) {
    const message = context.msg?.message || {};
    const wrapper = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message;
    const info = wrapper.documentMessage || wrapper.documentWithCaptionMessage?.message?.documentMessage;
    const quoted = wrapper.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedUnwrapped = quoted?.ephemeralMessage?.message || quoted?.viewOnceMessage?.message || quoted;
    const quotedInfo = quotedUnwrapped?.documentMessage || quotedUnwrapped?.documentWithCaptionMessage?.message?.documentMessage;
    const document = info || quotedInfo;
    if (!document) return context.reply('📦 Reply to an APK document or attach an APK with .apkscan. The bot will inspect it without installing or executing it.');
    const fileName = String(document.fileName || 'uploaded.apk');
    if (!/\.apk$/i.test(fileName) && !String(document.mimetype || '').includes('android.package-archive')) return context.reply('❌ That file does not look like an Android APK.');
    if (Number(document.fileLength || 0) > MAX_APK_BYTES) return context.reply('❌ APK is larger than the 200 MB scan limit.');
    if (!document.mediaKey && !document.url) return context.reply('❌ This APK is no longer downloadable from WhatsApp. Please send it again.');

    try {
        const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
        const stream = await downloadContentFromMessage(document, 'document');
        const chunks = [];
        let total = 0;
        for await (const chunk of stream) {
            total += chunk.length;
            if (total > MAX_APK_BYTES) throw new Error('APK exceeded the 200 MB scan limit');
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) throw new Error('APK was empty');
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sukuna-apk-'));
        const apkPath = path.join(tempDir, 'scan.apk');
        fs.writeFileSync(apkPath, buffer, { mode: 0o600 });
        const listing = await runCommand('unzip', ['-l', apkPath]);
        const entries = listing.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const hasManifest = entries.some(line => /AndroidManifest\.xml$/i.test(line));
        const dexCount = entries.filter(line => /classes\d*\.dex$/i.test(line)).length;
        const nativeCount = entries.filter(line => /lib\/[^/]+\/[^/]+\.so$/i.test(line)).length;
        const embeddedUrls = [...new Set(buffer.toString('latin1').match(/https?:\/\/[^\s"'<>\u0000-\u001f]{4,240}/gi) || [])].slice(0, 8);
        const riskFlags = [];
        if (!hasManifest) riskFlags.push('missing AndroidManifest.xml');
        if (!dexCount) riskFlags.push('no classes.dex found');
        if (embeddedUrls.some(url => /bit\.ly|tinyurl|ipfs|ngrok|paste|discord(app)?\.com\/api/i.test(url))) riskFlags.push('shortener, tunnel, paste, or webhook URL present');
        if (embeddedUrls.some(url => /^http:\/\//i.test(url))) riskFlags.push('unencrypted HTTP URL present');
        const risk = riskFlags.length >= 2 ? 'HIGH' : riskFlags.length === 1 ? 'REVIEW' : 'LOW';
        fs.rmSync(tempDir, { recursive: true, force: true });
        const report = `📦 *APK SECURITY REPORT*\n\nFile: ${escapeText(fileName)}\nSize: ${(buffer.length / 1024 / 1024).toFixed(2)} MB\nSHA-256: \`${hash}\`\n\nRisk indicator: *${risk}*\n\nArchive checks:\n• AndroidManifest.xml: ${hasManifest ? 'present' : 'missing'}\n• DEX files: ${dexCount}\n• Native libraries: ${nativeCount}\n• Executed: *never*\n\n${riskFlags.length ? `Flags:\n${riskFlags.map(flag => `• ${flag}`).join('\n')}` : 'No basic archive red flags detected.'}\n\n${embeddedUrls.length ? `Embedded URLs:\n${embeddedUrls.map(url => `• ${clip(url, 180)}`).join('\n')}` : 'No embedded URLs detected in raw archive strings.'}\n\n_This is a static first-pass scan, not a malware guarantee. Do not install an APK solely because this report is LOW._`;
        return context.reply(report);
    } catch (error) {
        console.error('[APPSTORE APKSCAN]', error.message);
        return context.reply(`❌ APK scan failed: ${error.message}`);
    }
}

async function runAction(action, context) {
    const { args = [], reply, prefix = '.' } = context;
    const commandPrefix = prefix || '.';
    try {
        if (action === 'search') {
            const term = args.join(' ').trim();
            if (!term) return reply(`🛍️ Usage: ${commandPrefix}playstore <app name or keyword>\nExample: ${commandPrefix}playstore video editor`);
            const apps = await searchApps(term);
            rememberSearch(context.from, context.sender, apps);
            if (!apps.length) return reply(`🔎 No Google Play apps found for “${clip(term, 90)}”.`);
            return reply(`🛍️ *SUKUNA STORE SEARCH*\n\nQuery: _${escapeText(term)}_\n\n${apps.map(appLine).join('\n\n')}\n\nUse your prefix with appinfo <number>, appqr <number>, or appdownload <number>.`);
        }

        if (action === 'info') {
            if (!args.length) return reply(`📱 Usage: ${commandPrefix}appinfo <app name, package name, Play link, or result number>`);
            const app = await resolveApp(args, context);
            const screenshots = Array.isArray(app.screenshots) ? app.screenshots.slice(0, 3) : [];
            const categories = Array.isArray(app.categories) ? app.categories.map(item => item.name).filter(Boolean).join(', ') : (app.genre || 'Not published');
            const price = app.priceText || (app.free ? 'Free' : 'See Play Store');
            const details = `📱 *${escapeText(app.title)}*\n\nDeveloper: ${escapeText(app.developer)}\nPackage: \`${app.appId}\`\nRating: ${app.scoreText || 'N/A'}★ (${formatNumber(app.ratings)} ratings)\nWritten reviews: ${formatNumber(app.reviews)}\nInstalls: ${escapeText(app.installs || 'Not published')}\nPrice: ${escapeText(price)}\nCategory: ${escapeText(categories)}\nAndroid: ${escapeText(app.androidVersionText || app.androidVersion || 'Varies with device')}\nVersion: ${escapeText(app.version || 'Not published')}\nUpdated: ${formatDate(app.updated)}\n\n${escapeText(app.summary || 'No summary published.')}\n\n${app.recentChanges ? `Recent changes: ${escapeText(clip(app.recentChanges, 500))}\n\n` : ''}${appLinkBlock(app)}${screenshots.length ? `\nScreenshots: ${screenshots.length} available` : ''}`;
            return sendImageOrReply(context, app.icon, details);
        }

        if (action === 'download') {
            if (!args.length) return reply(`🔗 Usage: ${commandPrefix}appdownload <app name, package name, Play link, or result number>`);
            const app = await resolveApp(args, context);
            return reply(`⬇️ *OFFICIAL APP LINK*\n\n${escapeText(app.title)}\n${escapeText(app.developer)}\n\n${appLinkBlock(app)}\n\n_This command sends the official listing only. Android installation must be confirmed manually on your phone._`);
        }

        if (action === 'compare') {
            const [left, right] = await resolveTwoApps(args, context);
            const field = (key, fallback = 'N/A') => escapeText(left[key] ?? fallback);
            const fieldRight = (key, fallback = 'N/A') => escapeText(right[key] ?? fallback);
            return reply(`⚖️ *APP COMPARISON*\n\n*${escapeText(left.title)}* vs *${escapeText(right.title)}*\n\nDeveloper | ${escapeText(left.developer)} | ${escapeText(right.developer)}\nRating | ${field('scoreText')}★ | ${fieldRight('scoreText')}★\nRatings | ${formatNumber(left.ratings)} | ${formatNumber(right.ratings)}\nInstalls | ${escapeText(left.installs || 'N/A')} | ${escapeText(right.installs || 'N/A')}\nPrice | ${field('priceText', left.free ? 'Free' : 'See listing')} | ${fieldRight('priceText', right.free ? 'Free' : 'See listing')}\nAndroid | ${field('androidVersionText', left.androidVersion || 'Varies')} | ${fieldRight('androidVersionText', right.androidVersion || 'Varies')}\nUpdated | ${formatDate(left.updated)} | ${formatDate(right.updated)}\n\n${left.url || playUrl(left.appId)}\n${right.url || playUrl(right.appId)}`);
        }

        if (action === 'category' || action === 'top') {
            const rawCategory = args.join(' ').trim();
            const category = rawCategory ? categoryId(rawCategory) : '';
            if (rawCategory && !category) return reply('Unknown category. Try: games, social, communication, tools, productivity, photography, music, education, finance, shopping, or video.');
            const apps = await listApps(category);
            rememberSearch(context.from, context.sender, apps);
            return reply(`🏆 *${action === 'top' ? 'TOP APPS' : 'APP CATEGORY'}*${rawCategory ? ` · ${escapeText(rawCategory)}` : ''}\n\n${apps.length ? apps.map(appLine).join('\n\n') : 'No apps were returned.'}\n\nUse your prefix with appinfo <number> for details.`);
        }

        if (action === 'updates') {
            if (!args.length) return reply(`🔄 Usage: ${commandPrefix}appupdates <package name or app name> [installed version]`);
            const app = await resolveApp(args.filter(arg => !/^v?\d+(?:\.\d+)+$/i.test(arg)), context);
            const installed = args.find(arg => /^v?\d+(?:\.\d+)+$/i.test(arg));
            const comparison = installed && compareVersions(app.version, installed);
            const status = comparison === null ? 'Google Play did not expose a comparable numeric version.' : comparison > 0 ? `A newer listing appears to be available than ${installed}.` : comparison === 0 ? 'The supplied version matches the listing.' : 'The supplied version is newer than the public listing or version data may be unusual.';
            return reply(`🔄 *APP UPDATE CHECK*\n\n${escapeText(app.title)}\nCurrent public version: ${escapeText(app.version || 'Not published')}\nLast updated: ${formatDate(app.updated)}\n${status}\n\nRecent changes: ${escapeText(clip(app.recentChanges || 'Not published', 800))}\n\n${appLinkBlock(app)}`);
        }

        if (action === 'qr') {
            if (!args.length) return reply(`🔳 Usage: ${commandPrefix}appqr <package name, app name, Play link, or result number>`);
            const app = await resolveApp(args, context);
            const url = app.url || playUrl(app.appId);
            const qr = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(url)}`;
            return sendImageOrReply(context, qr, `🔳 *${escapeText(app.title)}*\n\nScan to open the official Google Play listing:\n${url}`);
        }

        if (action === 'reviews') {
            if (!args.length) return reply(`⭐ Usage: ${commandPrefix}appreviews <package name or app name>`);
            const app = await resolveApp(args, context);
            const result = await gplayCall('reviews', { appId: app.appId, num: 5, sort: gplay.sort?.NEWEST || 2 });
            const reviews = Array.isArray(result) ? result : result?.data || [];
            if (!reviews.length) return reply(`⭐ No public reviews were returned for ${escapeText(app.title)}.`);
            const text = reviews.slice(0, 5).map((review, i) => `${i + 1}. ${'★'.repeat(Math.max(0, Math.min(5, Number(review.score) || 0)))} ${escapeText(clip(review.title || review.text || 'Review', 110))}\n   ${escapeText(clip(review.text || 'No written text.', 260))}`).join('\n\n');
            return reply(`⭐ *RECENT REVIEWS · ${escapeText(app.title)}*\n\n${text}\n\nSource: ${appLinkBlock(app)}`);
        }

        if (action === 'alternatives') {
            if (!args.length) return reply(`🔁 Usage: ${commandPrefix}appalternatives <package name or app name>`);
            const app = await resolveApp(args, context);
            let alternatives = [];
            try {
                alternatives = (await gplayCall('similar', { appId: app.appId, fullDetail: false }) || []).map(normalizeApp).filter(Boolean);
            } catch (_) {}
            if (!alternatives.length) alternatives = await searchApps(`${app.title} alternatives`, MAX_RESULTS);
            alternatives = alternatives.filter(item => item.appId !== app.appId).slice(0, MAX_RESULTS);
            return reply(`🔁 *ALTERNATIVES TO ${escapeText(app.title.toUpperCase())}*\n\n${alternatives.length ? alternatives.map(appLine).join('\n\n') : 'No alternatives were returned by Google Play.'}`);
        }

        if (action === 'size') {
            if (!args.length) return reply(`📦 Usage: ${commandPrefix}appsize <package name or app name>`);
            const app = await resolveApp(args, context);
            const size = app.size || app.contentSize || 'Not published in the public listing';
            return reply(`📦 *APP REQUIREMENTS*\n\n${escapeText(app.title)}\nDownload / installed size: ${escapeText(size)}\nAndroid requirement: ${escapeText(app.androidVersionText || app.androidVersion || 'Varies with device')}\nVersion: ${escapeText(app.version || 'Not published')}\nPrice: ${escapeText(app.priceText || (app.free ? 'Free' : 'See listing'))}\n\nGoogle Play may calculate the final download size for each device, so check the official listing before installing.\n${appLinkBlock(app)}`);
        }

        if (action === 'collection') return runCollection(context);
        if (action === 'apkscan') return runApkScan(context);
        return reply(`Unknown store action. Use your prefix with playstore, appinfo, appdownload, appcompare, appcategory, topapps, appupdates, appqr, apkscan, appreviews, appalternatives, appsize, or appcollection.`);
    } catch (error) {
        console.error(`[APPSTORE ${action}]`, error.message);
        return reply(`❌ Store request failed: ${error.message}`);
    }
}

function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const stdout = [];
        const stderr = [];
        child.stdout.on('data', chunk => stdout.push(chunk));
        child.stderr.on('data', chunk => stderr.push(chunk));
        child.on('error', reject);
        child.on('close', code => resolve({ code, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }));
    });
}

module.exports = { runAction, extractAppId, categoryId, searchApps, getApp };

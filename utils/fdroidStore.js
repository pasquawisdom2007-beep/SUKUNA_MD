'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'https://f-droid.org';
const SEARCH_API = 'https://search.f-droid.org/api/search_apps';
const PACKAGE_API = 'https://f-droid.org/api/v1/packages';
const APK_BASE = 'https://f-droid.org/repo';
const MAX_APK_BYTES = 200 * 1024 * 1024;
const SEARCH_TTL = 10 * 60 * 1000;
const searchCache = new Map();
const resultSessions = new Map();

function clip(value, max = 500) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function esc(value) {
    return String(value || '').replace(/[\\*_`]/g, '\\$&');
}

function packageFromUrl(url) {
    const match = String(url || '').match(/\/packages\/([A-Za-z0-9._-]+)/);
    return match ? match[1] : '';
}

function isPackageId(value) {
    return /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_-]+)+$/.test(String(value || '').trim());
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
    if (map.size > 100) map.delete(map.keys().next().value);
    return value;
}

async function fetchWithTimeout(url, options = {}, timeout = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, {
            ...options,
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'user-agent': 'SukunaStore/1.0', ...(options.headers || {}) },
        });
    } finally {
        clearTimeout(timer);
    }
}

async function fetchJson(url) {
    const response = await fetchWithTimeout(url, { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`F-Droid returned HTTP ${response.status}`);
    if (!payload || typeof payload !== 'object') throw new Error('F-Droid returned invalid JSON');
    return payload;
}

function normalizeSearchApp(app) {
    const packageName = packageFromUrl(app?.url);
    if (!packageName || !app?.name) return null;
    return {
        packageName,
        name: clip(app.name, 160),
        summary: clip(app.summary || 'No summary published.', 300),
        icon: app.icon || '',
        pageUrl: app.url || `${BASE}/en/packages/${packageName}/`,
    };
}

async function searchApps(term, limit = 5) {
    const query = clip(term, 100);
    if (!query) return [];
    const key = query.toLowerCase();
    const cached = cacheGet(searchCache, key);
    if (cached) return cached;
    const payload = await fetchJson(`${SEARCH_API}?q=${encodeURIComponent(query)}`);
    const results = Array.isArray(payload.apps) ? payload.apps.map(normalizeSearchApp).filter(Boolean) : [];
    results.sort((a, b) => {
        const exactA = a.name.toLowerCase() === key || a.packageName.toLowerCase() === key ? 0 : 1;
        const exactB = b.name.toLowerCase() === key || b.packageName.toLowerCase() === key ? 0 : 1;
        return exactA - exactB;
    });
    return cacheSet(searchCache, key, results.slice(0, limit), SEARCH_TTL);
}

async function getPackageInfo(packageName) {
    const payload = await fetchJson(`${PACKAGE_API}/${encodeURIComponent(packageName)}`);
    const versions = Array.isArray(payload.packages) ? payload.packages
        .map(item => ({
            versionName: String(item.versionName || 'Unknown'),
            versionCode: Number(item.versionCode),
        }))
        .filter(item => Number.isFinite(item.versionCode))
        .sort((a, b) => b.versionCode - a.versionCode) : [];
    if (!versions.length) throw new Error('F-Droid has no downloadable versions for this package');
    return {
        packageName: String(payload.packageName || packageName),
        suggestedVersionCode: Number(payload.suggestedVersionCode) || null,
        versions,
        latest: versions[0],
    };
}

async function resolveApp(query, resultSelector) {
    const raw = String(query || '').trim();
    if (!raw) throw new Error('provide an app name, F-Droid package name, or search result number');
    const number = Number(raw);
    if (resultSelector && Number.isInteger(number)) {
        const selected = resultSelector[number - 1];
        if (selected) return selected;
    }
    if (isPackageId(raw)) {
        const info = await getPackageInfo(raw);
        return { packageName: raw, name: raw, summary: 'Official F-Droid package', pageUrl: `${BASE}/en/packages/${raw}/`, info };
    }
    const results = await searchApps(raw, 5);
    if (!results.length) return null;
    const exact = results.find(item => item.name.toLowerCase() === raw.toLowerCase() || item.packageName.toLowerCase() === raw.toLowerCase());
    const app = exact || results[0];
    app.info = await getPackageInfo(app.packageName);
    return app;
}

function rememberResults(from, sender, results) {
    resultSessions.set(`${from || 'unknown'}:${sender || 'unknown'}`, { results, expiresAt: Date.now() + SEARCH_TTL });
    if (resultSessions.size > 100) resultSessions.delete(resultSessions.keys().next().value);
}

function rememberedResults(from, sender) {
    const state = resultSessions.get(`${from || 'unknown'}:${sender || 'unknown'}`);
    if (!state || state.expiresAt < Date.now()) return [];
    return state.results;
}

function allowedFinalHost(url) {
    const configured = String(process.env.FDROID_ALLOWED_MIRRORS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    const allowed = new Set(['f-droid.org', 'www.f-droid.org', ...configured]);
    try {
        const host = new URL(url).hostname.toLowerCase();
        return allowed.has(host) || allowed.has(`https://${host}`);
    } catch (_) {
        return false;
    }
}

async function downloadApk(app) {
    const release = app.info?.latest || (await getPackageInfo(app.packageName)).latest;
    const filename = `${app.packageName}_${release.versionCode}.apk`;
    const url = `${APK_BASE}/${encodeURIComponent(filename)}`;
    const response = await fetchWithTimeout(url, { headers: { accept: 'application/vnd.android.package-archive, application/octet-stream' } }, 90000);
    if (!response.ok) throw new Error(`APK download returned HTTP ${response.status}`);
    if (!allowedFinalHost(response.url || url)) throw new Error('download redirected to an unapproved host');
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('application/vnd.android.package-archive') && !contentType.includes('application/octet-stream') && !contentType.includes('zip')) {
        throw new Error(`download was not an APK (content type: ${contentType})`);
    }
    const declaredSize = Number(response.headers.get('content-length')) || 0;
    if (declaredSize > MAX_APK_BYTES) throw new Error('APK is larger than the 200 MB limit');
    if (!response.body) throw new Error('F-Droid returned no download body');

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sukuna-fdroid-'));
    const filePath = path.join(tempDir, filename);
    const handle = await fs.promises.open(filePath, 'w', 0o600);
    const hash = crypto.createHash('sha256');
    let size = 0;
    try {
        for await (const chunk of response.body) {
            size += chunk.length;
            if (size > MAX_APK_BYTES) throw new Error('APK exceeded the 200 MB limit while downloading');
            hash.update(chunk);
            await handle.write(chunk);
        }
        await handle.close();
        if (size < 4) throw new Error('downloaded APK was empty or truncated');
        const probeHandle = await fs.promises.open(filePath, 'r');
        const firstBytes = Buffer.alloc(4);
        await probeHandle.read(firstBytes, 0, 4, 0);
        await probeHandle.close();
        if (firstBytes[0] !== 0x50 || firstBytes[1] !== 0x4b) throw new Error('downloaded file is not a ZIP/APK archive');
        return {
            filePath,
            tempDir,
            filename,
            size,
            sha256: hash.digest('hex'),
            url,
            signatureUrl: `${url}.asc`,
            release,
        };
    } catch (error) {
        try { await handle.close(); } catch (_) {}
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        throw error;
    }
}

function formatSize(bytes) {
    return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} MB`;
}

async function runSearch(context) {
    const query = context.args.join(' ').trim();
    if (!query) return context.reply(`Use: ${context.prefix || '.'}apksearch <app name>\nExample: ${context.prefix || '.'}apksearch termux`);
    const results = await searchApps(query, 5);
    rememberResults(context.from, context.sender, results);
    if (!results.length) return context.reply(`🧩 No official F-Droid app matched “${clip(query, 80)}”.`);
    const body = results.map((app, index) => `${index + 1}. *${esc(app.name)}*\n   ${esc(app.summary)}\n   Package: \`${app.packageName}\``).join('\n\n');
    return context.reply(`🧩 *F-DROID APK SEARCH*\n\n${body}\n\nUse your prefix with apkdownload <number> to download a result.`);
}

async function runDownload(context) {
    const query = context.args.join(' ').trim();
    if (!query) return context.reply(`Use: ${context.prefix || '.'}apkdownload <app name, package name, or search result number>\nExample: ${context.prefix || '.'}apkdownload termux`);
    const previous = rememberedResults(context.from, context.sender);
    const app = await resolveApp(query, previous);
    if (!app) return context.reply(`🧩 No official F-Droid package matched “${clip(query, 80)}”.\nFor proprietary apps such as CapCut, use appinfo or appdownload for the official Google Play listing; this command does not use random MediaFire mirrors.`);
    if (!app.info) app.info = await getPackageInfo(app.packageName);

    let downloaded;
    try {
        downloaded = await downloadApk(app);
        const caption = `📦 *F-DROID APK*\n\nApp: ${esc(app.name)}\nPackage: \`${app.packageName}\`\nVersion: ${esc(downloaded.release.versionName)} (${downloaded.release.versionCode})\nSize: ${formatSize(downloaded.size)}\nSHA-256: \`${downloaded.sha256}\`\n\nSource: ${downloaded.url}\nSignature: ${downloaded.signatureUrl}\n\n_F-Droid recommends using its client for safer update notifications. This file is sent for manual installation; the bot cannot install it on your phone._`;
        return await context.sock.sendMessage(context.from, {
            document: { url: downloaded.filePath },
            mimetype: 'application/vnd.android.package-archive',
            fileName: downloaded.filename,
            caption,
        }, { quoted: context.msg });
    } finally {
        if (downloaded?.tempDir) await fs.promises.rm(downloaded.tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function runAction(action, context) {
    try {
        if (action === 'search') return await runSearch(context);
        if (action === 'download') return await runDownload(context);
        return context.reply('Unknown F-Droid action.');
    } catch (error) {
        console.error(`[FDROID ${action}]`, error.message);
        return context.reply(`❌ F-Droid request failed: ${error.message}`);
    }
}

module.exports = {
    runAction,
    searchApps,
    getPackageInfo,
    resolveApp,
    downloadApk,
    formatSize,
};

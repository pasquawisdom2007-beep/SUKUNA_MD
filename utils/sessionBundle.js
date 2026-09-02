'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BUNDLE_TYPE = 'sukuna-baileys-auth-bundle';

function decodeBase64Session(value) {
    let raw = String(value || '')
        .replace(/^data:.*?;base64,/, '')
        .replace(/```(?:text|base64|json)?/gi, '')
        .replace(/```/g, '')
        .replace(/(?:SESSION\s*ID|SESSION_ID|AUTH\s*BUNDLE)\s*[:=]\s*/i, '')
        .replace(/^Pasqua\s*[:~]+\s*/i, '')
        .replace(/\s+/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    if (!raw) throw new Error('SESSION_ID is empty');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new Error('SESSION_ID contains invalid Base64 characters');
    raw += '='.repeat((4 - (raw.length % 4)) % 4);
    const bytes = Buffer.from(raw, 'base64');
    if (!bytes.length) throw new Error('SESSION_ID decoded to empty data');
    let decoded;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        try { decoded = zlib.gunzipSync(bytes).toString('utf8'); } catch (_) { throw new Error('SESSION_ID is not valid gzip data'); }
    } else {
        decoded = bytes.toString('utf8');
    }
    if (!decoded) throw new Error('SESSION_ID decoded to empty data');
    let parsed;
    try { parsed = JSON.parse(decoded); } catch (_) { throw new Error('SESSION_ID is not valid Base64 JSON'); }
    if (parsed && parsed.type === BUNDLE_TYPE && parsed.encoding === 'gzip' && typeof parsed.data === 'string') {
        try {
            parsed = JSON.parse(zlib.gunzipSync(Buffer.from(parsed.data, 'base64')).toString('utf8'));
        } catch (_) {
            throw new Error('SESSION_ID auth bundle is not valid gzip data');
        }
    }
    return parsed;
}

function isBundle(value) {
    return value && value.type === BUNDLE_TYPE && value.version === 1 && value.files && typeof value.files === 'object';
}

function restoreSessionPayload(payload, sessionDir) {
    if (isBundle(payload)) {
        const root = path.resolve(sessionDir);
        const entries = Object.entries(payload.files);
        if (!entries.length || !Object.prototype.hasOwnProperty.call(payload.files, 'creds.json')) {
            throw new Error('SESSION_ID auth bundle is missing creds.json');
        }
        fs.mkdirSync(root, { recursive: true, mode: 0o700 });
        for (const [relativeName, encoded] of entries) {
            if (!relativeName || path.isAbsolute(relativeName)) throw new Error('SESSION_ID contains an unsafe auth filename');
            const target = path.resolve(root, relativeName);
            if (target !== root && !target.startsWith(root + path.sep)) throw new Error('SESSION_ID contains path traversal');
            if (typeof encoded !== 'string') throw new Error(`SESSION_ID auth file is invalid: ${relativeName}`);
            fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
            const temp = `${target}.tmp-${process.pid}`;
            fs.writeFileSync(temp, Buffer.from(encoded, 'base64'), { mode: 0o600 });
            fs.renameSync(temp, target);
        }
        JSON.parse(fs.readFileSync(path.join(root, 'creds.json'), 'utf8'));
        return { format: 'bundle', fileCount: entries.length };
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('SESSION_ID must contain a JSON object');
    }
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
    const credsFile = path.join(sessionDir, 'creds.json');
    const temp = `${credsFile}.tmp-${process.pid}`;
    fs.writeFileSync(temp, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, credsFile);
    return { format: 'legacy-creds', fileCount: 1 };
}

function restoreSessionBase64(value, sessionDir) {
    return restoreSessionPayload(decodeBase64Session(value), sessionDir);
}

module.exports = { BUNDLE_TYPE, decodeBase64Session, isBundle, restoreSessionPayload, restoreSessionBase64 };

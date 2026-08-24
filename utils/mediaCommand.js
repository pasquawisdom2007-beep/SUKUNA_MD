'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { downloadMediaMessage } = require('@pasqua-baileys/baileys');
const { isPrivateHost } = require('./commandHelpers');

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

let FFMPEG = 'ffmpeg';
try {
    const staticPath = require('ffmpeg-static');
    if (staticPath && fs.existsSync(staticPath)) FFMPEG = staticPath;
} catch (_) {}

function tempPath(extension = '') {
    return path.join(os.tmpdir(), `sukuna-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`);
}

function mediaContext(msg) {
    return msg?.message?.extendedTextMessage?.contextInfo
        || msg?.message?.imageMessage?.contextInfo
        || msg?.message?.videoMessage?.contextInfo
        || msg?.message?.audioMessage?.contextInfo
        || msg?.message?.documentMessage?.contextInfo
        || null;
}

function unwrapMessage(message) {
    let current = message;
    for (let i = 0; i < 6 && current; i += 1) {
        const wrapper = current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.viewOnceMessageV2Extension?.message
            || current.ephemeralMessage?.message;
        if (!wrapper) break;
        current = wrapper;
    }
    return current || message;
}

function resolveMedia(msg) {
    const context = mediaContext(msg);
    const quoted = context?.quotedMessage || null;
    const sources = [];
    if (quoted) sources.push({ message: quoted, quoted: true });
    if (msg?.message) sources.push({ message: msg.message, quoted: false });

    for (const source of sources) {
        const message = unwrapMessage(source.message);
        if (message?.imageMessage) return { ...source, type: 'image', node: message.imageMessage };
        if (message?.videoMessage) return { ...source, type: 'video', node: message.videoMessage };
        if (message?.audioMessage) return { ...source, type: 'audio', node: message.audioMessage };
        if (message?.stickerMessage) return { ...source, type: 'sticker', node: message.stickerMessage };
        if (message?.documentMessage) return { ...source, type: 'document', node: message.documentMessage };
    }
    return null;
}

async function downloadResolvedMedia(sock, msg, found = resolveMedia(msg)) {
    if (!found) return null;
    const context = mediaContext(msg);
    const key = found.quoted
        ? {
            remoteJid: msg?.key?.remoteJid,
            id: context?.stanzaId,
            participant: context?.participant,
        }
        : msg.key;
    const target = { key, message: found.message };
    const type = found.type === 'sticker' ? 'sticker' : found.type;
    const downloader = typeof sock?.downloadMediaMessage === 'function'
        ? sock.downloadMediaMessage.bind(sock)
        : downloadMediaMessage;
    const buffer = await downloader(
        target,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock?.updateMediaMessage }
    );
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty media buffer');
    if (buffer.length > MAX_MEDIA_BYTES) throw new Error(`media exceeds ${(MAX_MEDIA_BYTES / 1024 / 1024).toFixed(0)} MB limit`);
    return { ...found, buffer, type };
}

async function fetchUrlBuffer(url, maxBytes = MAX_MEDIA_BYTES) {
    let current = String(url);
    let response;
    for (let hop = 0; hop < 6; hop += 1) {
        const parsed = new URL(current);
        if (isPrivateHost(parsed.hostname)) throw new Error('private or local redirect target blocked');
        response = await fetch(current, {
            redirect: 'manual',
            headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            current = new URL(response.headers.get('location'), parsed).toString();
            continue;
        }
        break;
    }
    if (!response || (response.status >= 300 && response.status < 400)) throw new Error('too many redirects');
    if (!response.ok) throw new Error(`download returned HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > maxBytes) throw new Error(`remote file exceeds ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('remote file is empty');
    if (buffer.length > maxBytes) throw new Error(`remote file exceeds ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit`);
    return { buffer, contentType: response.headers.get('content-type') || 'application/octet-stream', finalUrl: current };
}

function runFfmpeg(args, input, { timeout = TIMEOUT_MS, maxOutputBytes = MAX_MEDIA_BYTES } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
        const output = [];
        const errors = [];
        let outputBytes = 0;
        let settled = false;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            error ? reject(error) : resolve(value);
        };
        const timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch (_) {}
            finish(new Error('FFmpeg timed out'));
        }, timeout);

        child.stdout.on('data', chunk => {
            outputBytes += chunk.length;
            if (outputBytes <= maxOutputBytes) output.push(chunk);
            else {
                try { child.kill('SIGKILL'); } catch (_) {}
                finish(new Error('FFmpeg output exceeded the size limit'));
            }
        });
        child.stderr.on('data', chunk => errors.push(chunk));
        child.on('error', error => finish(error));
        child.on('close', code => {
            if (code !== 0) return finish(new Error(Buffer.concat(errors).toString().trim() || `FFmpeg exited with code ${code}`));
            finish(null, Buffer.concat(output));
        });
        child.stdin.on('error', () => {});
        child.stdin.end(input);
    });
}

function safeUnlink(filePath) {
    try { fs.unlinkSync(filePath); } catch (_) {}
}

function writeTemp(buffer, extension) {
    const filePath = tempPath(extension);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

module.exports = {
    MAX_MEDIA_BYTES,
    FFMPEG,
    tempPath,
    mediaContext,
    unwrapMessage,
    resolveMedia,
    downloadResolvedMedia,
    fetchUrlBuffer,
    runFfmpeg,
    safeUnlink,
    writeTemp,
};

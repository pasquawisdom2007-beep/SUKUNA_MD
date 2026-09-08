'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_BYTES = 32 * 1024 * 1024;

function unwrap(message) {
    let current = message || null;
    for (let i = 0; i < 4 && current; i++) {
        if (current.imageMessage || current.videoMessage) return current;
        current = current.ephemeralMessage?.message
            || current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.documentWithCaptionMessage?.message
            || null;
    }
    return message || null;
}

function findAttachment(msg) {
    const direct = unwrap(msg?.message || msg);
    if (direct?.imageMessage) return { node: direct.imageMessage, type: 'image' };
    if (direct?.videoMessage) return { node: direct.videoMessage, type: 'video' };
    const context = direct?.extendedTextMessage?.contextInfo
        || direct?.imageMessage?.contextInfo
        || direct?.videoMessage?.contextInfo
        || {};
    const quoted = unwrap(context.quotedMessage);
    if (quoted?.imageMessage) return { node: quoted.imageMessage, type: 'image' };
    if (quoted?.videoMessage) return { node: quoted.videoMessage, type: 'video' };
    return null;
}

async function streamBuffer(node, type) {
    const stream = await downloadContentFromMessage(node, type);
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
        total += chunk.length;
        const limit = type === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (total > limit) throw new Error(`${type} is too large to analyze (limit ${Math.round(limit / 1024 / 1024)} MB)`);
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function dataUrl(buffer, mime) {
    return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function imageData(buffer, mime) {
    if (buffer.length <= MAX_IMAGE_BYTES) {
        return dataUrl(buffer, mime || 'image/jpeg');
    }
    try {
        const sharp = require('sharp');
        const compressed = await sharp(buffer).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
        return dataUrl(compressed, 'image/jpeg');
    } catch (_) {
        return dataUrl(buffer, mime || 'image/jpeg');
    }
}

async function videoFrames(buffer) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pasqua-vision-'));
    const input = path.join(dir, `${crypto.randomBytes(6).toString('hex')}.mp4`);
    const pattern = path.join(dir, 'frame-%02d.jpg');
    fs.writeFileSync(input, buffer);
    try {
        const ffmpeg = require('ffmpeg-static') || 'ffmpeg';
        await execFileAsync(ffmpeg, [
            '-hide_banner', '-loglevel', 'error', '-i', input,
            '-vf', 'fps=1,scale=1024:-2', '-frames:v', '4', '-q:v', '5', pattern,
        ], { timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
        const files = fs.readdirSync(dir).filter(file => /^frame-\d+\.jpg$/.test(file)).sort();
        if (!files.length) throw new Error('no video frames could be extracted');
        return files.map(file => dataUrl(fs.readFileSync(path.join(dir, file)), 'image/jpeg'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function extractPasquaMedia(msg) {
    const attachment = findAttachment(msg);
    if (!attachment) return null;
    const buffer = await streamBuffer(attachment.node, attachment.type);
    if (!buffer.length) throw new Error('the attached media was empty');
    if (attachment.type === 'image') {
        return { type: 'image', media: [await imageData(buffer, attachment.node.mimetype || 'image/jpeg')] };
    }
    return { type: 'video', media: await videoFrames(buffer) };
}

module.exports = { extractPasquaMedia, findAttachment };

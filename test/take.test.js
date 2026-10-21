'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const WebP = require('node-webpmux');
const { brandSticker, buildStickerExif } = require('../utils/stickerMetadata');
const { normalizeSticker } = require('../utils/stickerFfmpeg');
const take = require('../commands/general/take');

test('brands a WebP sticker with the native SUKUNA MD EXIF metadata', async () => {
    const source = await sharp({
        create: { width: 96, height: 96, channels: 4, background: { r: 90, g: 10, b: 20, alpha: 1 } },
    }).webp().toBuffer();
    const branded = await brandSticker(source);
    const image = new WebP.Image();
    await image.load(branded);
    assert.ok(image.exif);
    const exifText = image.exif.toString('utf8');
    assert.match(exifText, /SUKUNA MD/);
    assert.match(exifText, /pasqua/);
    const payloadLength = image.exif.readUInt32LE(14);
    assert.equal(payloadLength, image.exif.length - 22);
    const payload = JSON.parse(image.exif.subarray(22, 22 + payloadLength).toString('utf8'));
    assert.equal(payload['sticker-pack-name'], 'SUKUNA MD');
    assert.equal(payload['sticker-pack-publisher'], 'pasqua');
    assert.match(payload['sticker-pack-id'], /^[a-f0-9]{64}$/);
    assert.ok(branded.length > 16);
});

test('detects a sticker nested in a quoted extended message', () => {
    const stickerMessage = { stickerMessage: { mimetype: 'image/webp' } };
    const msg = {
        message: {
            extendedTextMessage: {
                contextInfo: { quotedMessage: stickerMessage },
            },
        },
    };
    assert.equal(take._private.quotedMessage(msg), stickerMessage);
    assert.ok(buildStickerExif().length > 24);
});

test('normalizes a sticker through FFmpeg before branding', async () => {
    const source = await sharp({
        create: { width: 321, height: 241, channels: 4, background: { r: 20, g: 90, b: 30, alpha: 1 } },
    }).webp().toBuffer();
    const normalized = await normalizeSticker(source);
    const metadata = await sharp(normalized, { animated: true }).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 512);
    assert.equal(metadata.pageHeight || metadata.height, 512);
});

'use strict';

const WebP = require('node-webpmux');

const DEFAULT_PACK_NAME = 'SUKUNA MD';
const DEFAULT_PUBLISHER = 'pasqua';
const DEFAULT_PACK_ID = 'com.sukuna.md';

function buildStickerExif({
    packName = DEFAULT_PACK_NAME,
    publisher = DEFAULT_PUBLISHER,
    packId = DEFAULT_PACK_ID,
} = {}) {
    const payload = Buffer.from(JSON.stringify({
        'sticker-pack-id': String(packId),
        'sticker-pack-name': String(packName),
        'sticker-pack-publisher': String(publisher),
        'sticker-pack-version': '1.0.0',
        'sticker-pack-thumbnail-url': '',
        'android-app-store-link': '',
        'ios-app-store-link': '',
        emojis: ['🙂'],
    }), 'utf8');

    // WhatsApp sticker metadata is stored as a JSON payload in an EXIF chunk.
    // The payload length is a four-byte little-endian value at offset 14;
    // without it WhatsApp may send the sticker but cannot open its information.
    const exifHeader = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    exifHeader.writeUInt32LE(payload.length, 14);
    return Buffer.concat([exifHeader, payload]);
}

async function brandSticker(buffer, options = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 16) {
        throw new Error('sticker data is empty or invalid');
    }

    const image = new WebP.Image();
    await image.load(buffer);
    image.exif = buildStickerExif(options);
    const branded = await image.save(null);
    if (!Buffer.isBuffer(branded) || branded.length < 16) {
        throw new Error('failed to save branded sticker');
    }
    return branded;
}

module.exports = {
    DEFAULT_PACK_NAME,
    DEFAULT_PUBLISHER,
    DEFAULT_PACK_ID,
    buildStickerExif,
    brandSticker,
};

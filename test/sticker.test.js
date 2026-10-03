'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const sharp = require('sharp');
const sticker = require('../commands/general/sticker');

test('video stickers become readable multi-frame 512px WebP', async () => {
    const fixture = spawnSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc2=size=321x241:rate=12',
        '-t', '1.2', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p',
        '-f', 'webm', 'pipe:1',
    ], { maxBuffer: 8 * 1024 * 1024 });

    assert.equal(fixture.status, 0, fixture.stderr.toString());
    const output = await sticker.videoToWebp(fixture.stdout);
    const metadata = await sharp(output, { animated: true }).metadata();

    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 512);
    assert.equal(metadata.pageHeight, 512);
    assert.ok(metadata.pages >= 2);
});

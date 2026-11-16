'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const command = require('../commands/owner/mentionsticker');
const { loadMentionSticker, sendMentionSticker, isWebp, isGzip } = require('../utils/mentionSticker');

function webpBuffer() {
    const buffer = Buffer.alloc(12);
    buffer.write('RIFF', 0, 4, 'ascii');
    buffer.write('WEBP', 8, 4, 'ascii');
    return buffer;
}

test('mention sticker loader accepts WebP and gzip/Lottie signatures', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mention-sticker-test-'));
    const webp = path.join(dir, 'sticker.webp');
    const lottie = path.join(dir, 'sticker.gz');
    await fs.promises.writeFile(webp, webpBuffer());
    await fs.promises.writeFile(lottie, Buffer.from([0x1f, 0x8b, 0x00]));
    assert.equal(isWebp(await fs.promises.readFile(webp)), true);
    assert.equal(isGzip(await fs.promises.readFile(lottie)), true);
    assert.equal((await loadMentionSticker(webp)).kind, 'sticker');
    assert.equal((await loadMentionSticker(lottie)).kind, 'lottie');
});

test('mentionsticker owner command saves and enables a configured WebP', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mention-sticker-command-'));
    const source = path.join(dir, 'sticker.webp');
    await fs.promises.writeFile(source, webpBuffer());
    const state = { setting: { enabled: false, source: '' }, replies: [] };
    const database = {
        getMentionSticker: () => state.setting,
        setMentionSticker: (_phone, value) => { state.setting = value; },
    };
    await command.execute({
        args: ['set', source], phoneNumber: '123', database, isOwner: true,
        reply: async text => state.replies.push(text),
    });
    assert.equal(state.setting.enabled, true);
    assert.equal(state.setting.source, source);
});

test('mentionsticker automatic handler sends once for an explicit mention', async () => {
    const sent = [];
    const database = { getMentionSticker: () => ({ enabled: true, source: __filename }) };
    // This test uses a temporary valid WebP rather than the JavaScript source.
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mention-sticker-handler-'));
    const source = path.join(dir, 'sticker.webp');
    await fs.promises.writeFile(source, webpBuffer());
    database.getMentionSticker = () => ({ enabled: true, source });
    const triggered = await command.handleMentionStickerTag(
        { sendMessage: async (...args) => sent.push(args) },
        { key: { id: 'M1' } },
        '123@g.us',
        { database, phoneNumber: '123', mentionedJids: ['456@s.whatsapp.net'] },
    );
    assert.equal(triggered, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], '123@g.us');
    assert.deepEqual(sent[0][1].sticker, webpBuffer());
    assert.deepEqual(sent[0][2], { quoted: { key: { id: 'M1' } } });
});

test('mentionsticker does not trigger without a native mention', async () => {
    let count = 0;
    const triggered = await command.handleMentionStickerTag(
        { sendMessage: async () => { count += 1; } }, {}, '123@g.us',
        { database: { getMentionSticker: () => ({ enabled: true, source: __filename }) }, phoneNumber: '123', mentionedJids: [] },
    );
    assert.equal(triggered, false);
    assert.equal(count, 0);
});

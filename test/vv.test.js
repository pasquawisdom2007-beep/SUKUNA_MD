'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { extractViewOnce, findMedia } = require('../utils/viewOnce');
const vvCommand = require('../commands/fun/vv');

test('extracts media from all supported view-once wrappers', () => {
    for (const wrapper of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
        const message = { [wrapper]: { message: { imageMessage: { mediaKey: Buffer.from('key'), directPath: '/media/image', mimetype: 'image/jpeg' } } } };
        const found = extractViewOnce(message);
        assert.equal(found?.mediaType, 'image');
        assert.equal(found?.mediaMsg.directPath, '/media/image');
        assert.equal(found?.isViewOnce, true);
    }
});

test('findMedia recognizes a stripped media node so callers can use cached originals', () => {
    const found = findMedia({ videoMessage: { mimetype: 'video/mp4', fileLength: '1234' } });
    assert.equal(found?.mediaType, 'video');
    assert.equal(found?.mediaMsg.mimetype, 'video/mp4');
});

test('direct media with a view-once marker is recognized', () => {
    const found = extractViewOnce({ audioMessage: { viewOnce: true, mediaKey: Buffer.from('key'), url: 'https://mmg.whatsapp.net/media/audio', mimetype: 'audio/ogg; codecs=opus' } });
    assert.equal(found?.mediaType, 'audio');
    assert.equal(found?.isViewOnce, true);
});

test('vv uses the normalized cached quote when raw contextInfo media is stripped', async () => {
    const sent = [];
    const image = Buffer.from('cached-image-bytes');
    await vvCommand.execute({
        sock: { async sendMessage(...args) { sent.push(args); } },
        msg: { message: { extendedTextMessage: { text: '.vv', contextInfo: { stanzaId: 'view-once-1', quotedMessage: { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } } } } } },
        from: '123@g.us',
        quoted: {
            key: { remoteJid: '123@g.us', id: 'view-once-1' },
            message: { viewOnceMessageV2: { message: { imageMessage: { mediaKey: Buffer.from('media-key'), directPath: '/media/image', mimetype: 'image/jpeg' } } } },
            async download() { return image; },
        },
        reply: async () => {},
    });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0][1], { image });
});

test('vv resolves the original media from a nested quoted-message chain', async () => {
    const sent = [];
    const image = Buffer.from('nested-local-image');
    await vvCommand.execute({
        sock: { async sendMessage(...args) { sent.push(args); } },
        msg: { message: { extendedTextMessage: { contextInfo: { stanzaId: 'explanation-1', quotedMessage: { conversation: 'this is the image' } } } } },
        from: '123@g.us',
        quoted: {
            key: { remoteJid: '123@g.us', id: 'explanation-1' },
            message: { conversation: 'this is the image' },
            quoted: {
                key: { remoteJid: '123@g.us', id: 'media-1' },
                message: { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } },
                async download() { return image; },
            },
        },
        reply: async () => {},
    });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0][1], { image });
});

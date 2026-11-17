'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { extractViewOnce, findMedia } = require('../utils/viewOnce');

test('extracts media from all supported view-once wrappers', () => {
    for (const wrapper of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
        const message = {
            [wrapper]: {
                message: {
                    imageMessage: {
                        mediaKey: Buffer.from('key'),
                        directPath: '/media/image',
                        mimetype: 'image/jpeg',
                    },
                },
            },
        };
        const found = extractViewOnce(message);
        assert.equal(found?.mediaType, 'image');
        assert.equal(found?.mediaMsg.directPath, '/media/image');
        assert.equal(found?.isViewOnce, true);
    }
});

test('findMedia recognizes a stripped media node so callers can use cached originals', () => {
    const found = findMedia({
        videoMessage: {
            mimetype: 'video/mp4',
            fileLength: '1234',
        },
    });
    assert.equal(found?.mediaType, 'video');
    assert.equal(found?.mediaMsg.mimetype, 'video/mp4');
});

test('direct media with a view-once marker is recognized', () => {
    const found = extractViewOnce({
        audioMessage: {
            viewOnce: true,
            mediaKey: Buffer.from('key'),
            url: 'https://mmg.whatsapp.net/media/audio',
            mimetype: 'audio/ogg; codecs=opus',
        },
    });
    assert.equal(found?.mediaType, 'audio');
    assert.equal(found?.isViewOnce, true);
});

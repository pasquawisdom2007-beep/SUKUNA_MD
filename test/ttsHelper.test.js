'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const tts = require('../utils/ttsHelper');

test('voice transcript converts written laughter into Cartesia nonverbal laughter', () => {
    assert.equal(tts.prepareVoiceTranscript('That is hilarious lol!'), 'That is hilarious [laughter]!');
    assert.equal(tts.prepareVoiceTranscript('I agree [laughs]'), 'I agree [laughter]');
});

test('text replies hide internal laughter markers', () => {
    assert.equal(tts.stripVoiceMarkers('That was funny [laughter] honestly.'), 'That was funny honestly.');
});

test('Cartesia request uses the configured voice and expressive audio format', async () => {
    const oldKey = process.env.CARTESIA_API_KEY;
    const oldFetch = global.fetch;
    let request;
    process.env.CARTESIA_API_KEY = 'test-only-not-a-real-key';
    global.fetch = async (url, options) => {
        request = { url, options, body: JSON.parse(options.body) };
        return { ok: true, arrayBuffer: async () => Buffer.alloc(2048, 1) };
    };
    try {
        const result = await tts.generateVoice('That is hilarious lol!');
        assert.ok(result?.buffer?.length >= 1024);
        assert.equal(request.url, 'https://api.cartesia.ai/tts/bytes');
        assert.equal(request.options.headers['Cartesia-Version'], '2026-08-14');
        assert.equal(request.body.model_id, 'sonic-3.6');
        assert.equal(request.body.voice.id, 'ef191366-f52f-447a-a398-ed8c0f2943a1');
        assert.equal(request.body.output_format.container, 'mp3');
        assert.equal(request.body.transcript, 'That is hilarious [laughter]!');
        assert.equal(request.body.generation_config.emotion, 'happy');
    } finally {
        global.fetch = oldFetch;
        if (oldKey === undefined) delete process.env.CARTESIA_API_KEY;
        else process.env.CARTESIA_API_KEY = oldKey;
    }
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const smartAI = require('../utils/smartAI');
const chatbotImageGen = require('../utils/chatbotImageGen');
const aiartvideo = require('../commands/media/aiartvideo');

test('smartAI generates high-resolution Agnes images using the existing Agnes key', async () => {
    const originalPost = axios.post;
    const image = Buffer.alloc(2048, 0x5a);
    let request;
    axios.post = async (url, body, config) => {
        request = { url, body, config };
        return { status: 200, data: { data: [{ b64_json: image.toString('base64') }] } };
    };
    try {
        const result = await smartAI.generateImage('photorealistic futuristic skyline', { width: 1920, height: 1080 });
        assert.ok(Buffer.isBuffer(result));
        assert.equal(result.length, image.length);
        assert.equal(request.url, 'https://apihub.agnes-ai.com/v1/images/generations');
        assert.equal(request.body.model, 'agnes-image-2.5-flash');
        assert.equal(request.body.prompt, 'photorealistic futuristic skyline');
        assert.equal(request.body.size, '2K');
        assert.equal(request.body.ratio, '16:9');
        assert.equal(request.body.return_base64, true);
        assert.ok(Buffer.from(request.config.headers.Authorization.slice(7)).equals(Buffer.from(smartAI.getAgnesApiKey())));
    } finally {
        axios.post = originalPost;
    }
});

test('smartAI downloads Agnes image URLs when the API returns URL output', async () => {
    const originalPost = axios.post;
    const originalGet = axios.get;
    const image = Buffer.alloc(1500, 0x3a);
    let downloaded;
    axios.post = async () => ({ status: 200, data: { data: [{ url: 'https://images.example/generated.png' }] } });
    axios.get = async (url, config) => {
        downloaded = { url, config };
        return { data: image };
    };
    try {
        const result = await smartAI.generateImage('a real photograph of a red bicycle');
        assert.ok(Buffer.isBuffer(result));
        assert.equal(result.length, image.length);
        assert.equal(downloaded.url, 'https://images.example/generated.png');
        assert.equal(downloaded.config.responseType, 'arraybuffer');
    } finally {
        axios.post = originalPost;
        axios.get = originalGet;
    }
});

test('Pasqua AI preserves futuristic and photorealistic style phrases', () => {
    assert.match(chatbotImageGen.detectImagePrompt('Create a futuristic image of a city on Mars'), /futuristic image of a city on Mars/i);
    assert.match(chatbotImageGen.detectImagePrompt('Generate a photorealistic photo of a mountain lake'), /photorealistic photo of a mountain lake/i);
    assert.match(chatbotImageGen.detectImagePrompt('Generate a photorealistic portrait of a woman in golden-hour light'), /photorealistic portrait of a woman/i);
});

test('aiartvideo submits and polls Agnes Video 2.5 Flash with the shared Agnes key', async () => {
    const calls = [];
    const client = {
        post: async (url, body, config) => {
            calls.push({ method: 'POST', url, body, config });
            return { status: 202, data: { video_id: 'mock-video-id', status: 'queued' } };
        },
        get: async (url, config) => {
            calls.push({ method: 'GET', url, config });
            return { status: 200, data: { status: 'completed', url: 'https://videos.example/mock.mp4' } };
        },
    };
    const videoUrl = await aiartvideo.generateAgnesVideo('A cinematic futuristic city at night', {
        client,
        sleep: async () => {},
    });
    assert.equal(videoUrl, 'https://videos.example/mock.mp4');
    assert.equal(calls[0].url, 'https://apihub.agnes-ai.com/v1/videos');
    assert.equal(calls[0].body.model, 'agnes-video-2.5-flash');
    assert.equal(calls[0].body.mode, 'text');
    assert.equal(calls[0].body.seconds, '5');
    assert.equal(calls[0].body.size, '720P');
    assert.equal(calls[0].body.aspect_ratio, '16:9');
    assert.equal(calls[0].body.n, 1);
    assert.ok(Buffer.from(calls[0].config.headers.Authorization.slice(7)).equals(Buffer.from(smartAI.getAgnesApiKey())));
    assert.match(calls[1].url, /\/agnesapi\?video_id=mock-video-id&model_name=agnes-video-2\.5-flash$/);
});

test('aiartvideo skips Agnes cleanly when no shared key is configured', async () => {
    let called = false;
    const result = await aiartvideo.generateAgnesVideo('test prompt', {
        apiKey: '',
        client: { post: async () => { called = true; }, get: async () => { called = true; } },
    });
    assert.equal(result, null);
    assert.equal(called, false);
});

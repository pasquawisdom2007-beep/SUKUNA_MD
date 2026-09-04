'use strict';

const MODEL_ENDPOINT = 'https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions';

function token() {
    return process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN || '';
}

async function replicateRequest(url, options = {}) {
    const headers = {
        Authorization: `Bearer ${token()}`,
        Accept: 'application/json',
        ...(options.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
    };
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = body?.detail || body?.error || body?.title || `HTTP ${response.status}`;
        throw new Error(String(detail));
    }
    return body;
}

async function upscaleWithReplicate(buffer, mimeType = 'image/jpeg', scale = 4, faceEnhance = false) {
    if (!token()) throw new Error('REPLICATE_API_TOKEN is not configured');
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty image buffer');

    const prediction = await replicateRequest(MODEL_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
            input: {
                image: `data:${mimeType};base64,${buffer.toString('base64')}`,
                scale: Math.min(4, Math.max(2, Number(scale) || 4)),
                face_enhance: Boolean(faceEnhance),
            },
        }),
    });

    const deadline = Date.now() + 120000;
    let current = prediction;
    while (current?.status === 'starting' || current?.status === 'processing') {
        if (Date.now() > deadline) throw new Error('upscaler timed out');
        await new Promise(resolve => setTimeout(resolve, 1500));
        current = await replicateRequest(current.urls?.get, { method: 'GET' });
    }

    if (current?.status !== 'succeeded') {
        throw new Error(current?.error || `upscaler finished with status ${current?.status || 'unknown'}`);
    }

    const outputUrl = Array.isArray(current.output) ? current.output[0] : current.output;
    if (!outputUrl) throw new Error('upscaler returned no image');
    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) throw new Error(`could not download upscaled image: HTTP ${imageResponse.status}`);
    return Buffer.from(await imageResponse.arrayBuffer());
}

module.exports = { upscaleWithReplicate };

'use strict';

const sharp = require('sharp');

// Add REPLICATE_API_TOKEN to the panel environment when AI face/texture enhancement is desired.
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN || '';
const REPLICATE_ENDPOINT = 'https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions';

async function localUpscale(buffer, scale = 4) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty image buffer');
    const factor = Math.min(4, Math.max(2, Number(scale) || 4));
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) throw new Error('could not read image dimensions');

    const maxDimension = 4096;
    return sharp(buffer)
        .resize({
            width: Math.min(Math.round(metadata.width * factor), maxDimension),
            height: Math.min(Math.round(metadata.height * factor), maxDimension),
            fit: 'inside',
            withoutEnlargement: false,
            kernel: sharp.kernel.lanczos3,
        })
        .sharpen({ sigma: 1.05, m1: 1.1, m2: 2.2 })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer();
}

async function replicateRequest(url, options = {}, apiKey = REPLICATE_API_TOKEN) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            ...(options.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(body?.detail || body?.error || `HTTP ${response.status}`));
    return body;
}

async function upscaleWithReplicate(buffer, mimeType = 'image/jpeg', scale = 4, faceEnhance = true, apiKey = REPLICATE_API_TOKEN) {
    if (!apiKey) throw new Error('Replicate API key is not configured');
    const prediction = await replicateRequest(REPLICATE_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
            input: {
                image: `data:${mimeType};base64,${buffer.toString('base64')}`,
                scale: Math.min(4, Math.max(2, Number(scale) || 4)),
                face_enhance: Boolean(faceEnhance),
            },
        }),
    }, apiKey);

    const deadline = Date.now() + 120000;
    let current = prediction;
    while (current?.status === 'starting' || current?.status === 'processing') {
        if (Date.now() > deadline) throw new Error('AI upscaler timed out');
        await new Promise(resolve => setTimeout(resolve, 1500));
        current = await replicateRequest(current.urls?.get, { method: 'GET' }, apiKey);
    }
    if (current?.status !== 'succeeded') throw new Error(current?.error || `AI upscaler status: ${current?.status || 'unknown'}`);

    const outputUrl = Array.isArray(current.output) ? current.output[0] : current.output;
    if (!outputUrl) throw new Error('AI upscaler returned no image');
    const output = await fetch(outputUrl);
    if (!output.ok) throw new Error(`could not download AI output: HTTP ${output.status}`);
    return Buffer.from(await output.arrayBuffer());
}

module.exports = { localUpscale, upscaleWithReplicate, hasReplicateToken: () => Boolean(REPLICATE_API_TOKEN) };

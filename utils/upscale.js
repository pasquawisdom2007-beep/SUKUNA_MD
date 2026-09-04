'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const sharp = require('sharp');

const execFileAsync = promisify(execFile);
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN || '';
const REPLICATE_ENDPOINT = 'https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions';
const UPSCAYL_BIN = process.env.UPSCAYL_BIN || process.env.UPSCAYL_PATH || '';
const UPSCAYL_MODELS_DIR = process.env.UPSCAYL_MODELS_DIR || '';
const UPSCAYL_MODEL = process.env.UPSCAYL_MODEL || 'realesrgan-x4plus';
const UPSCAYL_GPU_ID = process.env.UPSCAYL_GPU_ID || '';
const UPSCAYL_TIMEOUT_MS = Math.max(30_000, Number(process.env.UPSCAYL_TIMEOUT_MS) || 180_000);

function clampScale(scale) {
    const value = Number(scale);
    if (![2, 4].includes(value)) throw new Error('scale must be 2 or 4');
    return value;
}

function extensionForMime(mimeType = '') {
    const mime = String(mimeType).toLowerCase();
    if (mime.includes('png')) return '.png';
    if (mime.includes('webp')) return '.webp';
    return '.jpg';
}

function hasUpscayl() {
    return Boolean(UPSCAYL_BIN && UPSCAYL_MODELS_DIR);
}

async function localUpscale(buffer, scale = 4) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty image buffer');
    const factor = clampScale(scale);
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) throw new Error('could not read image dimensions');

    const maxDimension = 4096;
    const width = Math.min(Math.round(metadata.width * factor), maxDimension);
    const height = Math.min(Math.round(metadata.height * factor), maxDimension);
    const pipeline = sharp(buffer).resize({
        width,
        height,
        fit: 'inside',
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
    }).sharpen({ sigma: 1.05, m1: 1.1, m2: 2.2 });

    // Preserve transparency instead of silently flattening PNG/WebP images into JPEG.
    if (metadata.hasAlpha || metadata.format === 'png' || metadata.format === 'webp') {
        return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    }
    return pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
}

async function upscaleWithUpscayl(buffer, mimeType = 'image/jpeg', scale = 4) {
    if (!hasUpscayl()) throw new Error('Upscayl is not configured; set UPSCAYL_BIN and UPSCAYL_MODELS_DIR');
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty image buffer');
    const factor = clampScale(scale);
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sukuna-upscale-'));
    const inputPath = path.join(workDir, `input-${crypto.randomUUID()}${extensionForMime(mimeType)}`);
    const outputPath = path.join(workDir, 'output.png');
    const args = [
        '-i', inputPath,
        '-o', outputPath,
        '-s', String(factor),
        '-m', UPSCAYL_MODELS_DIR,
        '-n', UPSCAYL_MODEL,
        '-f', 'png',
    ];
    if (UPSCAYL_GPU_ID) args.push('-g', UPSCAYL_GPU_ID);

    try {
        await fs.writeFile(inputPath, buffer);
        try {
            await execFileAsync(UPSCAYL_BIN, args, {
                timeout: UPSCAYL_TIMEOUT_MS,
                maxBuffer: 2 * 1024 * 1024,
                windowsHide: true,
            });
        } catch (error) {
            const detail = String(error.stderr || error.stdout || error.message || 'Upscayl process failed').trim();
            throw new Error(`Upscayl failed: ${detail.slice(-600)}`);
        }
        const output = await fs.readFile(outputPath).catch(() => null);
        if (!output?.length) throw new Error('Upscayl finished without producing an output image');
        await sharp(output).metadata();
        return output;
    } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function replicateRequest(url, options = {}, apiKey = REPLICATE_API_TOKEN) {
    if (!url) throw new Error('AI upscaler returned no polling URL');
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
                scale: clampScale(scale),
                face_enhance: Boolean(faceEnhance),
            },
        }),
    }, apiKey);

    const deadline = Date.now() + 120_000;
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

module.exports = {
    localUpscale,
    upscaleWithUpscayl,
    upscaleWithReplicate,
    hasUpscayl,
    hasReplicateToken: () => Boolean(REPLICATE_API_TOKEN),
};

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const { FFMPEG } = require('./mediaCommand');

const MAX_SECONDS = 6;
const MAX_FRAMES = 90;
const TIMEOUT_MS = 90_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const FFMPEG_BIN = process.env.FFMPEG_PATH
    || (fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : FFMPEG);
const FILTER = [
    'fps=15',
    'scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2',
    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black',
    'format=yuv420p',
].join(',');

function runEncoder(inputPath, outputPath, encoder) {
    return new Promise((resolve, reject) => {
        const child = spawn(FFMPEG_BIN, [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-ss', '0', '-i', inputPath,
            '-t', String(MAX_SECONDS),
            '-frames:v', String(MAX_FRAMES),
            '-vf', FILTER,
            '-an', '-c:v', encoder,
            '-lossless', '0', '-q:v', '55',
            '-compression_level', '6', '-loop', '0',
            '-f', 'webp', outputPath,
        ]);
        const errors = [];
        let settled = false;
        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch (_) {}
            finish(new Error('FFmpeg timed out while normalizing the sticker'));
        }, TIMEOUT_MS);
        child.stderr.on('data', chunk => errors.push(chunk));
        child.on('error', finish);
        child.on('close', code => {
            if (code !== 0) {
                finish(new Error(Buffer.concat(errors).toString().trim() || `FFmpeg exited with code ${code}`));
            } else {
                finish();
            }
        });
    });
}

async function normalizeSticker(input) {
    if (!Buffer.isBuffer(input) || input.length < 16) throw new Error('sticker data is empty');
    const inputMetadata = await sharp(input, { animated: true }).metadata();
    const inputPages = inputMetadata.pages || 1;
    if (inputMetadata.format !== 'webp') throw new Error('sticker is not a WebP image');

    // Do not send animated WebP through this FFmpeg build's libwebp fallback:
    // libwebp can flatten the animation and libwebp_anim is corrupt on some
    // panel builds when its input is already an animated WebP. Sharp keeps the
    // page structure intact while resizing to WhatsApp's sticker canvas.
    if (inputPages > 1) {
        const animated = await sharp(input, { animated: true })
            .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 55, effort: 6, smartSubsample: true })
            .toBuffer();
        const metadata = await sharp(animated, { animated: true }).metadata();
        const canvasHeight = metadata.pageHeight || metadata.height;
        if (metadata.format !== 'webp' || metadata.width !== 512 || canvasHeight !== 512 || (metadata.pages || 1) < 2) {
            throw new Error('animation-aware WebP conversion did not preserve multiple frames');
        }
        if (animated.length > MAX_OUTPUT_BYTES) throw new Error('normalized sticker is too large');
        return animated;
    }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sukuna-take-'));
    const inputPath = path.join(workDir, 'input.webp');
    fs.writeFileSync(inputPath, input);
    let lastError;
    try {
        for (const encoder of ['libwebp_anim', 'libwebp']) {
            const outputPath = path.join(workDir, `${encoder}.webp`);
            try {
                await runEncoder(inputPath, outputPath, encoder);
                const output = fs.readFileSync(outputPath);
                const metadata = await sharp(output, { animated: true }).metadata();
                const canvasHeight = metadata.pageHeight || metadata.height;
                if (metadata.format !== 'webp' || metadata.width !== 512 || canvasHeight !== 512) {
                    throw new Error(`${encoder} produced an invalid WebP canvas`);
                }
                if (output.length > MAX_OUTPUT_BYTES) throw new Error('normalized sticker is too large');
                return output;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('no compatible FFmpeg WebP encoder available');
    } finally {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
    }
}

module.exports = { normalizeSticker, FILTER, FFMPEG_BIN };

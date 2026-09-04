'use strict';

const sharp = require('sharp');

async function upscaleImage(buffer, scale = 4) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty image buffer');
    const factor = Math.min(4, Math.max(2, Number(scale) || 4));
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) throw new Error('could not read image dimensions');

    const maxDimension = 4096;
    const targetWidth = Math.min(Math.round(metadata.width * factor), maxDimension);
    const targetHeight = Math.min(Math.round(metadata.height * factor), maxDimension);

    return sharp(buffer)
        .resize({
            width: targetWidth,
            height: targetHeight,
            fit: 'inside',
            withoutEnlargement: false,
            kernel: sharp.kernel.lanczos3,
        })
        .sharpen({ sigma: 1.05, m1: 1.1, m2: 2.2 })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer();
}

module.exports = { upscaleImage };

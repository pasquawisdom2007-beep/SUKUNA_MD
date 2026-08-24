'use strict';

const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { resolveMedia, downloadResolvedMedia } = require('../../utils/mediaCommand');
const { prefixOf, truncate } = require('../../utils/commandHelpers');

module.exports = {
    name: 'ocr',
    aliases: ['readtext', 'imagetotext'],
    description: 'Extract readable text from a replied image or sticker',
    usage: '.ocr (reply to an image)',
    category: 'utility',

    async execute({ sock, msg, from, reply, prefix }) {
        const px = prefixOf(prefix);
        const found = resolveMedia(msg);
        if (!found || !['image', 'sticker'].includes(found.type)) {
            return reply(`🔤 *OCR*\n\nReply to an image or static sticker with ${px}ocr.`);
        }
        let worker;
        try {
            const media = await downloadResolvedMedia(sock, msg, found);
            const image = await sharp(media.buffer)
                .rotate()
                .resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: false })
                .png()
                .toBuffer();
            worker = await createWorker('eng', 1, { logger: () => {} });
            const result = await worker.recognize(image);
            const text = String(result?.data?.text || '').trim();
            if (!text) return reply('❌ No readable text was found in that image.');
            return reply(`🔤 *OCR Result*\n\n${truncate(text, 5000)}`);
        } catch (error) {
            console.error('[ocr]', error.message);
            return reply(`❌ OCR failed: ${truncate(error.message, 300)}`);
        } finally {
            if (worker) await worker.terminate().catch(() => {});
        }
    },
};

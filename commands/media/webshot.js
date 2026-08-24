'use strict';

const { normalizeHttpUrl, prefixOf, truncate } = require('../../utils/commandHelpers');

const SCREENSHOT_API = 'https://prexzyapis.com/ssweb/webss?url=';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

module.exports = {
    name: 'webshot',
    aliases: ['webcapture', 'siteimage'],
    description: 'Capture a public webpage as an image',
    usage: '.webshot <url>',
    category: 'media',

    async execute({ sock, msg, from, reply, args, prefix }) {
        const px = prefixOf(prefix);
        const target = normalizeHttpUrl(args?.[0]);
        if (!target) return reply(`📸 *Webshot*\n\nUsage: ${px}webshot <public URL>\nExample: ${px}webshot https://example.com`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45_000);
        try {
            const response = await fetch(`${SCREENSHOT_API}${encodeURIComponent(target.toString())}`, {
                headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
                signal: controller.signal,
            });
            if (!response.ok) return reply(`⚠️ Screenshot service returned HTTP ${response.status}.`);
            const contentType = String(response.headers.get('content-type') || '').toLowerCase();

            if (contentType.startsWith('image/')) {
                const length = Number(response.headers.get('content-length') || 0);
                if (length > MAX_IMAGE_BYTES) return reply('⚠️ Screenshot is larger than the 12 MB limit.');
                const image = Buffer.from(await response.arrayBuffer());
                if (!image.length || image.length > MAX_IMAGE_BYTES) return reply('⚠️ Screenshot response was empty or too large.');
                return sock.sendMessage(from, {
                    image,
                    caption: `📸 *Webshot*\n${truncate(target.toString(), 300)}`,
                }, { quoted: msg });
            }

            if (contentType.includes('application/json')) {
                const data = await response.json();
                const imageUrl = data?.url || data?.image || data?.result;
                if (/^https?:\/\//i.test(String(imageUrl || ''))) {
                    return sock.sendMessage(from, {
                        image: { url: imageUrl },
                        caption: `📸 *Webshot*\n${truncate(target.toString(), 300)}`,
                    }, { quoted: msg });
                }
                return reply(`⚠️ Screenshot service error: ${truncate(data?.error || data?.message || 'no image returned', 250)}`);
            }
            return reply(`⚠️ Screenshot service returned an unsupported response (${contentType || 'unknown'}).`);
        } catch (error) {
            return reply(error.name === 'AbortError' ? '⏱️ Webshot timed out. Try a smaller or faster webpage.' : `⚠️ Webshot failed: ${truncate(error.message, 250)}`);
        } finally {
            clearTimeout(timer);
        }
    },
};

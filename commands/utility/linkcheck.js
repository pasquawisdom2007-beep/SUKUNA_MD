'use strict';

const { normalizeHttpUrl, prefixOf, truncate } = require('../../utils/commandHelpers');

function extractTitle(html) {
    const title = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return title ? title.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

module.exports = {
    name: 'linkcheck',
    aliases: ['urlcheck', 'checklink'],
    description: 'Inspect a public URL status, redirects, security, and metadata',
    usage: '.linkcheck <url>',
    category: 'utility',

    async execute({ reply, args, prefix }) {
        const px = prefixOf(prefix);
        const target = normalizeHttpUrl(args?.[0]);
        if (!target) return reply(`🔎 *Link Check*\n\nUsage: ${px}linkcheck <url>\nExample: ${px}linkcheck https://example.com`);

        let response;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        try {
            response = await fetch(target, {
                redirect: 'manual',
                headers: {
                    'User-Agent': 'SUKUNA-MD/3.0',
                    Range: 'bytes=0-524287',
                },
                signal: controller.signal,
            });
            const location = response.headers.get('location');
            const contentType = response.headers.get('content-type') || 'unknown';
            const length = response.headers.get('content-length') || 'unknown';
            let title = '';
            if (contentType.includes('text/html') && response.status >= 200 && response.status < 300) {
                title = extractTitle(await response.text());
            }
            const lines = [
                '🔎 *Link Check*',
                `URL: ${truncate(target.toString(), 320)}`,
                `Status: *${response.status} ${response.statusText || ''}*`.trim(),
                `HTTPS: *${target.protocol === 'https:' ? 'yes' : 'no'}*`,
                `Type: ${truncate(contentType, 120)}`,
                `Size: ${length === 'unknown' ? 'unknown' : `${length} bytes`}`,
            ];
            if (location) lines.push(`Redirect: ${truncate(new URL(location, target).toString(), 320)}`);
            if (title) lines.push(`Title: ${truncate(title, 240)}`);
            return reply(lines.join('\n'));
        } catch (error) {
            return reply(error.name === 'AbortError' ? '⏱️ Link check timed out.' : `❌ Link check failed: ${truncate(error.message, 250)}`);
        } finally {
            clearTimeout(timer);
        }
    },
};

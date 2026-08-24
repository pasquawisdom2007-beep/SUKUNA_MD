'use strict';

const { normalizeHttpUrl, prefixOf, truncate, isPrivateHost } = require('../../utils/commandHelpers');

module.exports = {
    name: 'unshort',
    aliases: ['expandurl', 'resolveurl'],
    description: 'Expand a shortened URL and show its final destination',
    usage: '.unshort <url>',
    category: 'utility',

    async execute({ reply, args, prefix }) {
        const px = prefixOf(prefix);
        const initial = normalizeHttpUrl(args?.[0]);
        if (!initial) return reply(`🔗 *Unshorten URL*\n\nUsage: ${px}unshort <short URL>`);

        const visited = new Set();
        let current = initial;
        let status = 0;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        try {
            for (let hop = 0; hop < 8; hop += 1) {
                if (isPrivateHost(current.hostname)) throw new Error('private or local redirect target blocked');
                if (visited.has(current.toString())) throw new Error('redirect loop detected');
                visited.add(current.toString());
                const response = await fetch(current, {
                    method: 'HEAD',
                    redirect: 'manual',
                    headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
                    signal: controller.signal,
                });
                status = response.status;
                const location = response.headers.get('location');
                if (!location || status < 300 || status >= 400) break;
                current = new URL(location, current);
                if (isPrivateHost(current.hostname)) throw new Error('private or local redirect target blocked');
            }
            if (visited.size >= 8 && current.toString() !== [...visited][visited.size - 1]) {
                throw new Error('more than 8 redirects');
            }
            return reply(
                '🔗 *Expanded URL*\n' +
                `Original: ${truncate(initial.toString(), 320)}\n` +
                `Final: ${truncate(current.toString(), 320)}\n` +
                `HTTP: ${status || 'unknown'}\n` +
                `Redirects followed: ${Math.max(0, visited.size - 1)}`
            );
        } catch (error) {
            return reply(error.name === 'AbortError' ? '⏱️ URL expansion timed out.' : `❌ Could not expand URL: ${truncate(error.message, 250)}`);
        } finally {
            clearTimeout(timer);
        }
    },
};

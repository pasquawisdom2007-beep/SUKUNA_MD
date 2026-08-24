'use strict';

const { prefixOf, truncate } = require('../../utils/commandHelpers');

function validPackageName(value) {
    return /^@?[a-z0-9._-]+(?:\/[a-z0-9._-]+)?$/i.test(value) && value.length <= 180;
}

module.exports = {
    name: 'npmview',
    aliases: ['npmstats', 'npmpackage'],
    description: 'Show public npm package metadata and weekly downloads',
    usage: '.npmview <package>',
    category: 'utility',

    async execute({ reply, args, prefix }) {
        const px = prefixOf(prefix);
        const pkg = String(args?.[0] || '').trim();
        if (!validPackageName(pkg)) return reply(`📦 *npm View*\n\nUsage: ${px}npmview <package>\nExample: ${px}npmview axios`);
        try {
            const encoded = encodeURIComponent(pkg);
            const [infoResponse, downloadsResponse] = await Promise.all([
                fetch(`https://registry.npmjs.org/${encoded}`, { headers: { 'User-Agent': 'SUKUNA-MD/3.0' }, signal: AbortSignal.timeout(20_000) }),
                fetch(`https://api.npmjs.org/downloads/point/last-week/${encoded}`, { headers: { 'User-Agent': 'SUKUNA-MD/3.0' }, signal: AbortSignal.timeout(20_000) }),
            ]);
            if (!infoResponse.ok) return reply(`❌ npm package not found (HTTP ${infoResponse.status}).`);
            const data = await infoResponse.json();
            const latest = data['dist-tags']?.latest || 'unknown';
            const version = data.versions?.[latest] || {};
            const downloads = downloadsResponse.ok ? await downloadsResponse.json() : null;
            const repository = typeof version.repository === 'string' ? version.repository : version.repository?.url;
            return reply(
                '📦 *npm Package*\n' +
                `Name: ${data.name || pkg}\n` +
                `Latest: *${latest}*\n` +
                `Weekly downloads: ${downloads?.downloads?.toLocaleString?.() || 'unavailable'}\n` +
                `License: ${version.license || data.license || 'unknown'}\n` +
                `Description: ${truncate(data.description || 'No description', 350)}\n` +
                `Repository: ${truncate(repository || 'unlisted', 300)}\n` +
                `Published: ${(data.time?.[latest] || version.time) ? new Date(data.time?.[latest] || version.time).toISOString().slice(0, 10) : 'unknown'}\n` +
                `Dependencies: ${Object.keys(version.dependencies || {}).length}`
            );
        } catch (error) {
            return reply(`❌ npm lookup failed: ${truncate(error.message, 280)}`);
        }
    },
};

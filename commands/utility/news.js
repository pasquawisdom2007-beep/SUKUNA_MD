'use strict';

const https = require('https');

const BASE = 'https://news.google.com/rss';
const TOPICS = new Set(['world', 'nation', 'business', 'technology', 'entertainment', 'sports', 'science', 'health']);

function fetchText(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'SUKUNA-MD-News/1.0', Accept: 'application/rss+xml, application/xml' },
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                if (redirectCount >= 3) {
                    reject(new Error('news feed redirected too many times'));
                    return;
                }
                resolve(fetchText(new URL(res.headers.location, url).toString(), redirectCount + 1));
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`news feed returned HTTP ${res.statusCode}`));
                    return;
                }
                resolve(Buffer.concat(chunks).toString('utf8'));
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('news feed timeout')));
    });
}

function decodeXml(value) {
    return String(value || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function tag(block, name) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return decodeXml(match?.[1] || '');
}

function parseItems(xml, limit = 8) {
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while (items.length < limit && (match = re.exec(xml))) {
        const block = match[1];
        const title = tag(block, 'title');
        const link = tag(block, 'link');
        const source = tag(block, 'source');
        const pubDate = tag(block, 'pubDate');
        if (title) items.push({ title, link, source, pubDate });
    }
    return items;
}

function feedUrl(query) {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized || normalized === 'top' || normalized === 'trending' || normalized === 'headlines') {
        return `${BASE}?hl=en-US&gl=US&ceid=US:en`;
    }
    if (TOPICS.has(normalized)) {
        return `${BASE}/headlines/section/topic/${encodeURIComponent(normalized.toUpperCase())}?hl=en-US&gl=US&ceid=US:en`;
    }
    return `${BASE}/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

module.exports = {
    name: 'news',
    aliases: ['headlines', 'trending', 'currentnews'],
    description: 'Show current or trending headlines, optionally filtered by topic',
    category: 'utility',

    async execute({ reply, args }) {
        const query = args.join(' ').trim();
        try {
            const items = parseItems(await fetchText(feedUrl(query)), 8);
            if (!items.length) return reply(`📰 No current headlines found${query ? ` for *${query}*` : ''}.`);

            const title = query ? `NEWS · ${query.toUpperCase()}` : 'TOP CURRENT NEWS';
            const lines = [`╔══════════════════════════╗`, `║      ${title.slice(0, 22).padEnd(22)}║`, '╚══════════════════════════╝', ''];
            items.forEach((item, i) => {
                lines.push(`${i + 1}. *${item.title}*`);
                if (item.source) lines.push(`   ${item.source}`);
                if (item.pubDate) {
                    const date = new Date(item.pubDate);
                    if (!Number.isNaN(date.getTime())) lines.push(`   ${date.toUTCString().replace(':00 GMT', ' GMT')}`);
                }
                if (item.link) lines.push(`   ${item.link}`);
                lines.push('');
            });
            lines.push('_Feed: Google News RSS · Headlines can change throughout the day._');
            return reply(lines.join('\n'));
        } catch (error) {
            console.error('[NEWS]', error.message);
            return reply(`❌ News lookup failed: ${error.message}`);
        }
    },
};

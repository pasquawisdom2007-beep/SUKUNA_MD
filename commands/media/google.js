/**
 * .google <query> — search the web like Google.
 *
 * Returns:
 *   • A rich explanation of the topic (Wikipedia + DuckDuckGo abstract)
 *   • A list of relevant sites with short descriptions and links
 *   • A preview image (ALWAYS present — falls back through several sources
 *     and finally an AI-generated image so an image is never missing)
 *
 * No API key required. Uses only free, keyless public endpoints so it keeps
 * working out of the box on any deployment.
 */
'use strict';
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const http = axios.create({
    timeout: 20000,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    validateStatus: () => true,
});

/* ---------------------- individual data sources ---------------------- */

// DuckDuckGo Instant Answer — abstract + related topic links.
async function ddg(query) {
    try {
        const { status, data } = await http.get('https://api.duckduckgo.com/', {
            params: { q: query, format: 'json', no_html: 1, skip_disambig: 1, t: 'sukunamd' },
        });
        if (status !== 200 || !data) return null;

        const results = [];
        const collect = (arr) => {
            for (const item of arr || []) {
                if (item.Topics) { collect(item.Topics); continue; }
                if (item.FirstURL && item.Text) {
                    results.push({ title: item.Text.split(' - ')[0], url: item.FirstURL, snippet: item.Text });
                }
                if (results.length >= 8) break;
            }
        };
        collect(data.RelatedTopics);
        for (const r of data.Results || []) {
            if (r.FirstURL && r.Text) results.push({ title: r.Text, url: r.FirstURL, snippet: r.Text });
        }

        return {
            heading:  data.Heading || '',
            abstract: data.AbstractText || '',
            source:   data.AbstractSource || '',
            url:      data.AbstractURL || '',
            image:    data.Image ? (data.Image.startsWith('http') ? data.Image : `https://duckduckgo.com${data.Image}`) : '',
            results,
        };
    } catch (_) { return null; }
}

// Wikipedia REST summary — clean explanation + a reliable thumbnail image.
async function wiki(query) {
    try {
        // Resolve the best-matching page title first.
        const s = await http.get('https://en.wikipedia.org/w/api.php', {
            params: { action: 'query', list: 'search', srsearch: query, format: 'json', srlimit: 1, origin: '*' },
        });
        const hit = s.data?.query?.search?.[0];
        if (!hit) return null;

        const title = hit.title;
        const { status, data } = await http.get(
            'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')),
        );
        if (status !== 200 || !data) return null;

        return {
            title:   data.title || title,
            extract: data.extract || '',
            image:   data.originalimage?.source || data.thumbnail?.source || '',
            url:     data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        };
    } catch (_) { return null; }
}

// Scrape an og:image from a page to use as a preview.
async function ogImage(url) {
    try {
        if (!url || !/^https?:\/\//.test(url)) return '';
        const { status, data } = await http.get(url, { timeout: 12000, maxContentLength: 3_000_000 });
        if (status !== 200 || typeof data !== 'string') return '';
        const m = data.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
               || data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i);
        let img = m?.[1] || '';
        if (img && img.startsWith('//')) img = 'https:' + img;
        return /^https?:\/\//.test(img) ? img : '';
    } catch (_) { return ''; }
}

// Last-resort: generate a preview image so one is ALWAYS attached.
async function generatedImage(query) {
    try {
        const seed = Math.floor(Math.random() * 1e9);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(query)}` +
            `?width=1024&height=576&seed=${seed}&nologo=true&model=flux`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, headers: { 'User-Agent': UA } });
        const buf = Buffer.from(res.data);
        return buf.length > 1024 ? buf : null;
    } catch (_) { return null; }
}

/* ------------------------------- command ------------------------------- */

module.exports = {
    name: 'google',
    aliases: ['search', 'gsearch', 'web'],
    // Internal source hooks reused by streamsearch; the public .google behavior is unchanged.
    _sources: { ddg, wiki, ogImage, generatedImage },
    description: 'Search the web like Google — explanations, sites and a preview image',
    category: 'media',
    usage: '.google <query>',

    async execute({ sock, msg, from, reply, args }) {
        const query = (args || []).join(' ').trim();
        if (!query) {
            return reply(
                '🔎 *Google Search*\n\n' +
                'Usage: .google <anything>\n' +
                'Example: .google jujutsu kaisen',
            );
        }

        await sock.sendMessage(from, { react: { text: '🔎', key: msg.key } }).catch(() => {});

        // Gather everything in parallel.
        const [d, w] = await Promise.all([ddg(query), wiki(query)]);

        const heading  = w?.title || d?.heading || query;
        const abstract = (w?.extract && w.extract.length >= (d?.abstract?.length || 0))
            ? w.extract
            : (d?.abstract || w?.extract || '');

        // Build the ranked list of sites.
        const sites = [];
        const pushSite = (title, url, snippet) => {
            if (!url || !/^https?:\/\//.test(url)) return;
            if (sites.some(s => s.url === url)) return;
            sites.push({ title: (title || url).slice(0, 70), url, snippet: (snippet || '').slice(0, 120) });
        };
        if (w?.url) pushSite(w.title + ' — Wikipedia', w.url, w.extract);
        if (d?.url) pushSite((d.source || heading) + ' — ' + heading, d.url, d.abstract);
        for (const r of d?.results || []) pushSite(r.title, r.url, r.snippet);
        const topSites = sites.slice(0, 6);

        if (!abstract && topSites.length === 0) {
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply(`❌ No results found for *${query}*. Try different keywords.`);
        }

        // Compose the Google-style caption.
        let caption = `🔎 *Google:* _${query}_\n`;
        caption += `━━━━━━━━━━━━━━━━━━\n\n`;
        caption += `📌 *${heading}*\n`;
        if (abstract) {
            const text = abstract.length > 850 ? abstract.slice(0, 847) + '…' : abstract;
            caption += `${text}\n`;
        }
        caption += `\n🌐 *Top results:*\n`;
        if (topSites.length) {
            topSites.forEach((s, i) => {
                caption += `\n*${i + 1}. ${s.title}*\n`;
                if (s.snippet) caption += `_${s.snippet}${s.snippet.length >= 120 ? '…' : ''}_\n`;
                caption += `🔗 ${s.url}\n`;
            });
        } else {
            caption += `_No extra links available._\n`;
        }
        caption += `\n> _Powered by SUKUNA MD · Google Search_`;

        // Resolve a preview image (a MUST). Try, in order:
        //   wiki image → ddg image → og:image of top result → generated image.
        let imageUrl = w?.image || d?.image || '';
        if (!imageUrl && topSites[0]) imageUrl = await ogImage(topSites[0].url);

        try {
            if (imageUrl && /^https?:\/\//.test(imageUrl)) {
                await sock.sendMessage(from, { image: { url: imageUrl }, caption }, { quoted: msg });
            } else {
                // Guaranteed fallback so an image is always attached.
                const buf = await generatedImage(heading + ' ' + query);
                if (buf) {
                    await sock.sendMessage(from, { image: buf, caption }, { quoted: msg });
                } else {
                    await reply(caption);
                }
            }
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (err) {
            console.error('[google] send error:', err.message);
            // If sending the image failed for any reason, still deliver the text.
            try { await reply(caption); } catch (_) {}
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        }
    },
};

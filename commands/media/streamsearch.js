'use strict';

const google = require('./google');
const { escapeHtml, sendRichHtml } = require('../../utils/genaiRich');

const sources = google._sources || {};
const MAX_RESULTS = 8;
const MAX_SNIPPET = 190;

function cleanUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./i, ''); } catch (_) { return 'google.com'; }
}

function faviconUrl(url) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(url))}&sz=128`;
}

function buildGoogleUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function collectSites(ddg, wiki, query) {
    const sites = [];
    const add = (title, url, snippet) => {
        const safeUrl = cleanUrl(url);
        if (!safeUrl || sites.some(item => item.url === safeUrl)) return;
        sites.push({
            title: String(title || safeUrl).replace(/\s+/g, ' ').slice(0, 90),
            url: safeUrl,
            snippet: String(snippet || '').replace(/\s+/g, ' ').slice(0, MAX_SNIPPET),
            image: '',
            domain: domainOf(safeUrl),
        });
    };
    if (wiki?.url) add(`${wiki.title || query} · Wikipedia`, wiki.url, wiki.extract);
    if (ddg?.url) add(`${ddg.source || ddg.heading || query}`, ddg.url, ddg.abstract);
    for (const result of ddg?.results || []) add(result.title, result.url, result.snippet);
    return sites.slice(0, MAX_RESULTS);
}

function resultCard(site, index) {
    const image = cleanUrl(site.image) || faviconUrl(site.url);
    const domain = site.domain || domainOf(site.url);
    return `<a class="post" href="${escapeHtml(site.url)}" target="_blank" rel="noopener noreferrer"><img class="postImage" src="${escapeHtml(image)}" alt=""><span class="postTop"><img src="${escapeHtml(faviconUrl(site.url))}" alt=""><b>${escapeHtml(domain)}</b></span><span class="postShade"></span><span class="postBottom"><strong>${escapeHtml(site.title)}</strong><small>Tap to view ↗</small></span></a>`;
}

function sectionHtml(label, sites, offset = 0) {
    if (!sites.length) return '';
    return `<section><h2>${escapeHtml(label)}</h2><div class="grid">${sites.map((site, index) => resultCard(site, offset + index)).join('')}</div></section>`;
}

function streamSearchHtml(query, heading, abstract, sites, googleUrl) {
    const heroSite = sites[0];
    const heroImage = heroSite ? (cleanUrl(heroSite.image) || faviconUrl(heroSite.url)) : faviconUrl(googleUrl);
    const related = sites.slice(0, Math.min(4, sites.length));
    const recent = sites.slice(4);
    const safeDescription = abstract || `Search results for ${query}. Browse the previews below and open any result directly.`;
    const description = safeDescription.length > 330 ? `${safeDescription.slice(0, 327)}…` : safeDescription;
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}body{min-height:100vh;padding:0;display:flex;align-items:flex-end;background:rgba(0,0,0,.16)}.sheet{width:100%;max-height:88vh;overflow:auto;padding:10px 16px 22px;background:#111b21;color:#e9edef;border-radius:26px 26px 0 0;box-shadow:0 -8px 28px #0007}.handle{width:42px;height:4px;margin:0 auto 15px;border-radius:99px;background:#8696a0}.identity{text-align:center}.avatar{display:block;width:78px;height:78px;margin:0 auto 10px;border-radius:50%;object-fit:cover;background:#202c33;border:2px solid #33454f;box-shadow:0 2px 12px #0008}.heading{margin:0;color:#f1f2f2;font-size:22px;line-height:1.15;font-weight:750}.heading .mark{display:inline-grid;place-items:center;width:17px;height:17px;margin-left:4px;border-radius:50%;background:#53bdeb;color:#111b21;font-size:12px;vertical-align:2px}.query{margin:5px 0 8px;color:#8696a0;font-size:12px}.stats{display:flex;justify-content:center;gap:0;color:#8696a0;font-size:11px}.stats span{padding:0 9px;border-right:1px solid #37434a}.stats span:last-child{border:0}.bio{margin:11px 0 0;color:#d1d7da;font-size:12px;line-height:1.45;text-align:left}.bio summary{display:inline;color:#53bdeb;cursor:pointer;font-weight:650}.bio summary::-webkit-details-marker{display:none}.bio summary:after{content:'  See more';}.bio[open] summary:after{content:'  See less';}.bioText{display:block;margin-top:5px}.primary{display:block;margin:15px 0 18px;padding:12px 16px;border-radius:9px;background:#25d366;color:#102a1b;text-align:center;text-decoration:none;font-size:14px;font-weight:750}.primary:active{background:#20bd5c}section{margin-top:16px}h2{margin:0 0 9px;color:#e9edef;font-size:15px;font-weight:650} .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.post{position:relative;display:block;aspect-ratio:1;overflow:hidden;border-radius:5px;background:#202c33;text-decoration:none;color:#fff}.postImage{width:100%;height:100%;display:block;object-fit:cover}.postTop{position:absolute;z-index:2;top:7px;left:7px;right:5px;display:flex;align-items:center;gap:5px;min-width:0;color:#fff;text-shadow:0 1px 3px #000;font-size:10px}.postTop img{width:17px;height:17px;border-radius:50%;background:#fff}.postTop b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.postShade{position:absolute;inset:0;background:linear-gradient(180deg,#0008,transparent 31%,transparent 55%,#000a)}.postBottom{position:absolute;z-index:2;left:8px;right:6px;bottom:7px;display:block}.postBottom strong,.postBottom small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 3px #000}.postBottom strong{font-size:10px}.postBottom small{margin-top:2px;color:#d1d7da;font-size:9px}.empty{padding:20px;color:#8696a0;text-align:center;font-size:12px}.footer{margin-top:18px;color:#667781;text-align:center;font-size:10px}
</style></head><body><main class="sheet"><div class="handle"></div><header class="identity"><img class="avatar" src="${escapeHtml(heroImage)}" alt=""><h1 class="heading">${escapeHtml(heading)} <span class="mark">✓</span></h1><div class="query">Google Search · ${escapeHtml(query)}</div><div class="stats"><span>${sites.length} results</span><span>Web search</span><span>Google</span></div></header><details class="bio"><summary></summary><span class="bioText">${escapeHtml(description)}</span></details><a class="primary" href="${escapeHtml(googleUrl)}" target="_blank" rel="noopener noreferrer">⌕ &nbsp; View in Google</a>${sectionHtml('Related results', related)}${sectionHtml(`${escapeHtml(heading)} · recent results`, recent, 4)}${!sites.length ? '<div class="empty">No preview cards were found. Use View in Google to continue.</div>' : ''}<div class="footer">Scroll to explore · Tap any card to view the source</div></main></body></html>`;
}

async function execute({ sock, msg, from, reply, args }) {
    const query = (args || []).join(' ').trim();
    if (!query) return reply('⌕ *Stream Search*\n\nUsage: .streamsearch <query>\nShort form: .sch <query>\nExample: .sch jujutsu kaisen');
    if (typeof sources.ddg !== 'function' || typeof sources.wiki !== 'function') return reply('Stream Search is temporarily unavailable because the Google scraper is not loaded.');

    await sock.sendMessage(from, { react: { text: '⌕', key: msg.key } }).catch(() => {});
    try {
        const [ddg, wiki] = await Promise.all([sources.ddg(query), sources.wiki(query)]);
        const sites = collectSites(ddg, wiki, query);
        const heading = wiki?.title || ddg?.heading || query;
        const abstract = wiki?.extract || ddg?.abstract || '';
        if (!sites.length && !abstract) return reply(`❌ No results found for *${query}*. Try another search.`);
        if (typeof sources.ogImage === 'function') {
            const images = await Promise.all(sites.map(site => sources.ogImage(site.url).catch(() => '')));
            images.forEach((image, index) => { sites[index].image = cleanUrl(image); });
        }
        await sendRichHtml({ sock, jid: from, quoted: msg, html: streamSearchHtml(query, heading, abstract, sites, buildGoogleUrl(query)) });
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (error) {
        console.error('[streamsearch]', error.message);
        await reply('❌ Stream Search could not load right now. Try `.sch <query>` again.');
    }
}

module.exports = {
    name: 'streamsearch',
    aliases: ['sch'],
    description: 'Search Google with a profile-style image result sheet',
    usage: '.streamsearch <query>',
    category: 'media',
    execute,
    _test: { collectSites, streamSearchHtml, buildGoogleUrl, faviconUrl },
};

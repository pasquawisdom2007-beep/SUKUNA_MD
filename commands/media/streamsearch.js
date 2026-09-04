'use strict';

const google = require('./google');
const { escapeHtml, sendRichHtml } = require('../../utils/genaiRich');

const sources = google._sources || {};
const MAX_RESULTS = 6;
const MAX_SNIPPET = 180;

function cleanUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
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
            title: String(title || safeUrl).slice(0, 90),
            url: safeUrl,
            snippet: String(snippet || '').slice(0, MAX_SNIPPET),
            image: '',
        });
    };
    if (wiki?.url) add(`${wiki.title || query} · Wikipedia`, wiki.url, wiki.extract);
    if (ddg?.url) add(`${ddg.source || ddg.heading || query}`, ddg.url, ddg.abstract);
    for (const result of ddg?.results || []) add(result.title, result.url, result.snippet);
    return sites.slice(0, MAX_RESULTS);
}

function streamSearchHtml(query, heading, abstract, sites, googleUrl) {
    const cards = sites.map((site, index) => {
        const image = cleanUrl(site.image);
        const media = image
            ? `<img class="thumb" src="${escapeHtml(image)}" alt="${escapeHtml(site.title)}">`
            : `<div class="thumb empty">${index + 1}</div>`;
        return `<a class="result" href="${escapeHtml(site.url)}" target="_blank" rel="noopener noreferrer">${media}<span class="resultBody"><b>${index + 1}. ${escapeHtml(site.title)}</b><small>${escapeHtml(site.snippet || 'Open this result')}</small><em>Tap to open result ↗</em></span></a>`;
    }).join('');
    const summary = abstract ? `<p class="summary">${escapeHtml(abstract.length > 520 ? abstract.slice(0, 517) + '…' : abstract)}</p>` : '';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:radial-gradient(circle at 50% 3%,#113b64,#050b16 75%)}.card{padding:13px;border:2px solid #35a9ff;border-radius:20px;background:linear-gradient(145deg,#071b31,#0c3455 52%,#06101e);color:#e5f5ff;box-shadow:inset 0 0 0 3px #0b3150,0 8px 20px #000b}.title{text-align:center;color:#b9e9ff;font:bold 21px Arial Black,Arial,sans-serif;letter-spacing:1px;text-shadow:0 0 12px #1caaff}.query{text-align:center;color:#74caff;font:11px monospace;margin:3px 0 9px;overflow-wrap:anywhere}.summary{margin:0 0 10px;padding:9px;border:1px solid #1d6b98;border-radius:10px;background:#061525;color:#cfeeff;font:12px/1.4 Arial}.actions{display:flex;gap:7px;margin-bottom:10px}.open{display:block;flex:1;padding:10px 8px;border-radius:10px;background:linear-gradient(#1aa3ec,#1262a0);border:1px solid #65d0ff;color:#fff;text-align:center;font-weight:900;text-decoration:none;font-size:12px}.label{margin:8px 0 6px;color:#75cfff;font:bold 10px monospace;letter-spacing:1px}.results{display:grid;grid-template-columns:1fr 1fr;gap:7px}.result{display:block;min-width:0;overflow:hidden;border:1px solid #1b638c;border-radius:11px;background:linear-gradient(145deg,#0a263f,#071725);color:#e8f7ff;text-decoration:none;box-shadow:0 3px 8px #0008}.result:active{transform:scale(.97);border-color:#67d5ff}.thumb{display:block;width:100%;height:92px;object-fit:cover;background:#06101a}.thumb.empty{display:grid;place-items:center;color:#67d5ff;font:bold 28px monospace;background:radial-gradient(circle,#164c72,#06111d)}.resultBody{display:block;padding:7px}.result b,.result small,.result em{display:block;overflow:hidden;text-overflow:ellipsis}.result b{white-space:nowrap;font-size:11px;color:#eaf8ff}.result small{height:31px;margin-top:4px;color:#9dc3d9;font:10px/1.45 Arial}.result em{margin-top:5px;color:#42bcff;font:9px monospace;font-style:normal}.footer{margin-top:10px;text-align:center;color:#78a8c1;font:10px monospace}
</style></head><body><div class="card"><div class="title">◈ STREAM SEARCH</div><div class="query">${escapeHtml(query)}</div>${summary}<div class="actions"><a class="open" href="${escapeHtml(googleUrl)}" target="_blank" rel="noopener noreferrer">OPEN IN GOOGLE ↗</a></div><div class="label">IMAGE RESULTS · TAP ANY CARD TO VIEW</div><div class="results">${cards || '<div class="summary">No direct results were found. Tap Open in Google to continue searching.</div>'}</div><div class="footer">Powered by Google scraper · SUKUNA MD</div></div></body></html>`;
}

async function execute({ sock, msg, from, reply, args }) {
    const query = (args || []).join(' ').trim();
    if (!query) return reply('◈ *Stream Search*\n\nUsage: .streamsearch <query>\nShort form: .sch <query>\nExample: .sch jujutsu kaisen');
    if (typeof sources.ddg !== 'function' || typeof sources.wiki !== 'function') return reply('Stream Search is temporarily unavailable because the Google scraper is not loaded.');

    await sock.sendMessage(from, { react: { text: '🔎', key: msg.key } }).catch(() => {});
    try {
        const [ddg, wiki] = await Promise.all([sources.ddg(query), sources.wiki(query)]);
        const sites = collectSites(ddg, wiki, query);
        const heading = wiki?.title || ddg?.heading || query;
        const abstract = wiki?.extract || ddg?.abstract || '';
        if (!sites.length && !abstract) return reply(`❌ No results found for *${query}*. Try another search.`);

        const imageTargets = sites.slice(0, MAX_RESULTS);
        if (typeof sources.ogImage === 'function') {
            const images = await Promise.all(imageTargets.map(site => sources.ogImage(site.url).catch(() => '')));
            images.forEach((image, index) => { sites[index].image = cleanUrl(image); });
        }
        await sendRichHtml({
            sock,
            jid: from,
            quoted: msg,
            html: streamSearchHtml(query, heading, abstract, sites, buildGoogleUrl(query)),
        });
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (error) {
        console.error('[streamsearch]', error.message);
        await reply('❌ Stream Search could not load right now. Try `.sch <query>` again.');
    }
}

module.exports = {
    name: 'streamsearch',
    aliases: ['sch'],
    description: 'Search Google with image-rich tappable result cards',
    usage: '.streamsearch <query>',
    category: 'media',
    execute,
    _test: { collectSites, streamSearchHtml, buildGoogleUrl },
};

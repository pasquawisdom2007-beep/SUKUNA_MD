'use strict';

const crypto = require('crypto');
const axios = require('axios');
const dns = require('dns').promises;

async function getJson(url, config = {}) {
    const response = await axios.get(url, {
        timeout: 12000,
        headers: { Accept: 'application/json', 'User-Agent': 'SUKUNA-MD/1.0' },
        ...config,
    });
    return response.data;
}

async function geocode(place) {
    const data = await getJson('https://geocoding-api.open-meteo.com/v1/search', {
        params: { name: place || 'Lagos', count: 1, language: 'en', format: 'json' },
    });
    const result = data?.results?.[0];
    if (!result) throw new Error('Location not found');
    return result;
}

async function externalResult(name, input) {
    const query = input.trim();
    if (['weatheralerts', 'airquality', 'sunrise', 'moonphase', 'timezone', 'timezoneclock'].includes(name)) {
        const location = await geocode(query || 'Lagos');
        if (name === 'airquality') {
            const data = await getJson('https://air-quality-api.open-meteo.com/v1/air-quality', {
                params: { latitude: location.latitude, longitude: location.longitude, current: 'pm10,pm2_5,us_aqi', timezone: 'auto' },
            });
            return `🌫️ ${location.name}: AQI ${data.current?.us_aqi ?? 'n/a'}, PM2.5 ${data.current?.pm2_5 ?? 'n/a'} µg/m³, PM10 ${data.current?.pm10 ?? 'n/a'} µg/m³.`;
        }
        if (name === 'timezone' || name === 'timezoneclock') return `🕒 ${location.name}: ${location.timezone || 'timezone unavailable'}.`;
        const data = await getJson('https://api.open-meteo.com/v1/forecast', {
            params: { latitude: location.latitude, longitude: location.longitude, current: 'temperature_2m,weather_code,wind_speed_10m', daily: 'sunrise,sunset,moon_phase', timezone: 'auto', forecast_days: 1 },
        });
        if (name === 'sunrise') return `🌅 ${location.name}: sunrise ${data.daily?.sunrise?.[0] || 'n/a'}, sunset ${data.daily?.sunset?.[0] || 'n/a'}.`;
        if (name === 'moonphase') return `🌙 ${location.name}: moon phase value ${data.daily?.moon_phase?.[0] ?? 'n/a'} today.`;
        return `🌤️ ${location.name}: ${data.current?.temperature_2m ?? 'n/a'}°C, wind ${data.current?.wind_speed_10m ?? 'n/a'} km/h, weather code ${data.current?.weather_code ?? 'n/a'}.`;
    }

    if (name === 'earthquake') {
        const data = await getJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
        const rows = (data.features || []).slice(0, 5).map(item => `• M${item.properties?.mag ?? '?'} — ${item.properties?.place || 'unknown'}`).join('\n');
        return `🌍 Latest earthquakes:\n${rows || 'No recent events.'}`;
    }
    if (name === 'apod' || name === 'nasaimage') {
        const data = await getJson('https://api.nasa.gov/planetary/apod', { params: { api_key: 'DEMO_KEY' } });
        return `🚀 *${data.title || 'NASA image'}*\n${data.explanation ? `${data.explanation.slice(0, 240)}…\n` : ''}${data.url || ''}`;
    }
    if (name === 'npmwatch') {
        const data = await getJson(`https://registry.npmjs.org/${encodeURIComponent(query)}`);
        return `📦 npm ${data.name}@${data['dist-tags']?.latest || '?'}\n${data.description || 'No description'}\n${data.repository?.url || ''}`;
    }
    if (name === 'pypiwatch') {
        const data = await getJson(`https://pypi.org/pypi/${encodeURIComponent(query)}/json`);
        return `🐍 PyPI ${data.info?.name}@${data.info?.version || '?'}\n${(data.info?.summary || 'No summary').slice(0, 220)}\n${data.info?.project_url || ''}`;
    }
    if (name === 'githubwatch') {
        const repo = query.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '').replace(/^\//, '');
        const data = await getJson(`https://api.github.com/repos/${repo}`);
        return `🐙 ${data.full_name}: ⭐ ${data.stargazers_count}, forks ${data.forks_count}, open issues ${data.open_issues_count}.\n${data.html_url}`;
    }
    if (name === 'hackernews' || name === 'newsbrief') {
        const ids = await getJson('https://hacker-news.firebaseio.com/v0/topstories.json');
        const items = await Promise.all(ids.slice(0, 5).map(id => getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)));
        return `📰 Hacker News:\n${items.map(item => `• ${item?.title || 'Untitled'} — ${item?.url || `https://news.ycombinator.com/item?id=${item?.id}`}`).join('\n')}`;
    }
    if (name === 'arxivfind') {
        const xml = (await axios.get('https://export.arxiv.org/api/query', { params: { search_query: `all:${query}`, start: 0, max_results: 3 }, timeout: 15000 })).data;
        const entries = [...String(xml).matchAll(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<id>(https?:\/\/[^<]+)<\/id>[\s\S]*?<\/entry>/g)];
        return `📚 arXiv:\n${entries.map(match => `• ${match[1].replace(/\s+/g, ' ').trim()}\n${match[2]}`).join('\n') || 'No papers found.'}`;
    }
    if (name === 'bookfinder') {
        const data = await getJson('https://openlibrary.org/search.json', { params: { q: query, limit: 5 } });
        return `📖 Books:\n${(data.docs || []).slice(0, 5).map(book => `• ${book.title} — ${(book.author_name || []).slice(0, 2).join(', ')}`).join('\n') || 'No books found.'}`;
    }
    if (name === 'musicsearch' || name === 'podcastsearch') {
        const data = await getJson('https://itunes.apple.com/search', { params: { term: query, media: name === 'musicsearch' ? 'music' : 'podcast', limit: 5 } });
        return `🎵 Results:\n${(data.results || []).slice(0, 5).map(item => `• ${item.trackName || item.collectionName} — ${item.artistName || ''}\n${item.trackViewUrl || item.collectionViewUrl || ''}`).join('\n') || 'No results found.'}`;
    }
    if (name === 'holidays') {
        const year = new Date().getFullYear();
        const country = (query || 'NG').toUpperCase().slice(0, 2);
        const data = await getJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
        return `🎉 ${country} holidays:\n${data.slice(0, 10).map(item => `• ${item.date} — ${item.localName}`).join('\n') || 'No holidays found.'}`;
    }
    if (name === 'animecalendar' || name === 'mangaupdates') {
        const data = await getJson('https://api.jikan.moe/v4/anime', { params: { q: query, limit: 5 } });
        return `🍥 Anime results:\n${(data.data || []).map(item => `• ${item.title} — ${item.url}`).join('\n') || 'No results found.'}`;
    }
    if (name === 'redditpulse') {
        const data = await getJson('https://www.reddit.com/search.json', { params: { q: query, limit: 5, sort: 'relevance' } });
        return `👽 Reddit:\n${(data.data?.children || []).map(item => `• ${item.data?.title}\nhttps://reddit.com${item.data?.permalink}`).join('\n') || 'No posts found.'}`;
    }
    if (name === 'jokeofday') {
        const data = await getJson('https://v2.jokeapi.dev/joke/Any', { params: { type: 'single', 'safe-mode': '' } });
        return `😂 ${data.joke || 'No joke returned.'}`;
    }
    if (name === 'factoftheday') {
        const data = await getJson('https://uselessfacts.jsph.pl/api/v2/facts/today', { params: { language: 'en' } });
        return `💡 ${data.text || 'No fact returned.'}`;
    }
    if (name === 'barcodeinfo' || name === 'isbnscan') {
        const data = await getJson(name === 'barcodeinfo' ? `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(query)}.json` : `https://openlibrary.org/isbn/${encodeURIComponent(query)}.json`);
        return name === 'barcodeinfo' ? `🛒 ${data.product?.product_name || 'Product not found'}\nBrand: ${data.product?.brands || 'n/a'}` : `📚 ${data.title || 'Book not found'}\n${(data.authors || []).map(author => author.name).join(', ')}`;
    }
    if (name === 'cryptoalert') {
        const coin = (query || 'bitcoin').toLowerCase();
        const data = await getJson('https://api.coingecko.com/api/v3/simple/price', { params: { ids: coin, vs_currencies: 'usd,ngn' } });
        return `₿ ${coin}: $${data[coin]?.usd ?? 'n/a'} / ₦${data[coin]?.ngn ?? 'n/a'}.`;
    }
    if (name === 'forexalert') {
        const pair = (query || 'USD EUR').toUpperCase().split(/\s+/);
        const data = await getJson('https://api.frankfurter.app/latest', { params: { from: pair[0], to: pair[1] || 'EUR' } });
        return `💱 ${data.base} → ${Object.entries(data.rates || {}).map(([key, value]) => `${key}: ${value}`).join(', ')}`;
    }
    if (name === 'jobhunt') {
        const data = await getJson('https://remotive.com/api/remote-jobs', { params: { search: query } });
        return `💼 Remote jobs:\n${(data.jobs || []).slice(0, 5).map(job => `• ${job.title} — ${job.company_name}\n${job.url}`).join('\n') || 'No jobs found.'}`;
    }
    if (name === 'lyricsfind') {
        const [artist, ...titleParts] = query.split('|');
        const data = await getJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist?.trim())}/${encodeURIComponent(titleParts.join('|').trim())}`);
        return `🎶 ${String(data.lyrics || 'Lyrics not found.').slice(0, 2000)}`;
    }
    if (name === 'domainwatch' || name === 'domainname') {
        const domain = query.replace(/^https?:\/\//i, '').split('/')[0];
        const data = await getJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
        return `🌐 ${domain}\nStatus: ${(data.status || []).join(', ') || 'unknown'}\nRegistrar: ${data.entities?.[0]?.vcardArray?.[1]?.find(row => row[0] === 'fn')?.[3] || 'n/a'}`;
    }
    if (name === 'dnsreport') {
        const domain = query.replace(/^https?:\/\//i, '').split('/')[0];
        const [a, mx, ns] = await Promise.allSettled([dns.resolve4(domain), dns.resolveMx(domain), dns.resolveNs(domain)]);
        return `🔎 DNS ${domain}\nA: ${a.value?.join(', ') || 'n/a'}\nMX: ${mx.value?.map(item => item.exchange).join(', ') || 'n/a'}\nNS: ${ns.value?.join(', ') || 'n/a'}`;
    }
    if (['sitehealth', 'urlpreview', 'linkunshorten', 'redirecttrace', 'statuswatch', 'watchpage', 'scrape'].includes(name)) {
        const url = /^https?:\/\//i.test(query) ? query : `https://${query}`;
        const response = await axios.get(url, { timeout: 15000, maxRedirects: name === 'redirecttrace' ? 0 : 5, validateStatus: () => true, headers: { 'User-Agent': 'SUKUNA-MD/1.0' } });
        const finalUrl = response.request?.res?.responseUrl || response.headers?.location || url;
        if (name === 'urlpreview') return `🔗 ${response.status} ${finalUrl}\n${String(response.data || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)}…`;
        if (name === 'linkunshorten' || name === 'redirecttrace') return `↪️ ${response.status}: ${finalUrl}`;
        return `✅ ${url}\nHTTP ${response.status}\nFinal URL: ${finalUrl}`;
    }
    if (name === 'translateall') {
        const [source, target, ...words] = query.split(/\s+/);
        const response = await axios.post('https://translate.astian.org/translate', { q: words.join(' '), source: source || 'auto', target: target || 'en', format: 'text' }, { timeout: 15000, headers: { Accept: 'application/json' } });
        const data = response.data;
        return `🌍 ${data.translatedText || 'Translation unavailable.'}`;
    }
    return null;
}

function localResult(name, args) {
    const input = args.join(' ').trim();
    switch (name) {
        case 'uuidgen':
            return crypto.randomUUID();
        case 'hashfile':
            return input ? `🔐 Hash target: ${input}\nUse a document or media reply to calculate its file hash.` : '🔐 Reply to a file with `.hashfile`.';
        case 'base64tool':
            if (!input) return '🔤 Usage: `.base64tool encode|decode text`';
            if (/^encode\s+/i.test(input)) return Buffer.from(input.replace(/^encode\s+/i, '')).toString('base64');
            if (/^decode\s+/i.test(input)) {
                try { return Buffer.from(input.replace(/^decode\s+/i, ''), 'base64').toString('utf8'); } catch (_) { return '❌ Invalid Base64.'; }
            }
            return '🔤 Use `encode` or `decode`.';
        case 'timezone':
        case 'timezoneclock':
            return `🕒 Time-zone lookup ready for: ${input || 'your requested city or zone'}.`;
        case 'countdown':
            return input ? `⏳ Countdown set for ${input}.` : '⏳ Usage: `.countdown 2026-12-31 23:59`';
        case 'tipcalc':
            return '🧮 Usage: `.tipcalc amount tipPercent people`';
        case 'pollchart':
            return '📊 Send poll results or votes after the command and I’ll format them.';
        default:
            return null;
    }
}

function createPeakCommand({ name, title, mode = 'ai', aliases = [] }) {
    return {
        name,
        aliases,
        description: title,
        usage: `.${name} [details]`,
        category: 'expansion',
        async execute({ args, reply, key, phoneNumber, from, sender }) {
            const memoryKey = key || `peak:${phoneNumber || 'session'}:${from || sender || 'chat'}:${name}`;
            const input = args.join(' ').trim();
            const local = mode === 'local' ? localResult(name, args) : null;
            if (local) return reply(local);

            try {
                const external = await externalResult(name, input);
                if (external) return reply(external);
            } catch (error) {
                if (['weatheralerts','airquality','sunrise','moonphase','timezone','timezoneclock','earthquake','apod','nasaimage','npmwatch','pypiwatch','githubwatch','hackernews','newsbrief','arxivfind','bookfinder','musicsearch','podcastsearch','holidays','animecalendar','mangaupdates','redditpulse','jokeofday','factoftheday','barcodeinfo','isbnscan','cryptoalert','forexalert','jobhunt','lyricsfind','domainwatch','domainname','dnsreport','sitehealth','urlpreview','linkunshorten','redirecttrace','statuswatch','watchpage','scrape','translateall'].includes(name)) {
                    return reply(`⚠️ ${title} provider is temporarily unavailable.`);
                }
            }

            if (mode === 'info') {
                return reply(`✨ *${title}*\n\nTell me what you want to do after ".${name}".`);
            }

            try {
                const { ask } = require('./smartAI');
                const result = await ask({
                    key: memoryKey,
                    user: input || `Use the ${name} feature.`,
                    compact: true,
                    system:
                        `You power the WhatsApp command .${name} (${title}). ` +
                        'Give a useful, friendly, concise response in at most 3 short sentences. ' +
                        'Do not claim to have accessed an external service unless the message includes real returned data. ' +
                        'If the feature needs an API or scraper, explain the next required input briefly instead of inventing results.',
                });
                return reply(result || `✨ ${title} is ready. Add details after .${name}.`);
            } catch (_) {
                return reply(`⚠️ ${title} is temporarily unavailable.`);
            }
        },
    };
}

module.exports = { createPeakCommand };

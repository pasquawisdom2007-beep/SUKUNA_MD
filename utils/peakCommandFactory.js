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
    if (name === 'scholarfind') {
        const data = await getJson('https://api.openalex.org/works', { params: { search: query, per_page: 5 } });
        return `🎓 Research works:\n${(data.results || []).map(item => `• ${item.title} (${item.publication_year || 'n/a'})\n${item.doi || item.primary_location?.landing_page_url || ''}`).join('\n') || 'No works found.'}`;
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
    if (name === 'animecalendar') {
        const data = await getJson('https://api.jikan.moe/v4/seasons/now', { params: { limit: 10 } });
        return `🍥 Anime airing now:\n${(data.data || []).slice(0, 10).map(item => `• ${item.title} — ${item.url}`).join('\n') || 'No anime found.'}`;
    }
    if (name === 'mangaupdates') {
        const data = await getJson('https://api.jikan.moe/v4/manga', { params: { q: query, limit: 5 } });
        return `📚 Manga results:\n${(data.data || []).map(item => `• ${item.title} — ${item.url}`).join('\n') || 'No manga found.'}`;
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
    if (name === 'foodscan') {
        const data = await getJson('https://world.openfoodfacts.org/cgi/search.pl', { params: { search_terms: query, search_simple: 1, action: 'process', json: 1, page_size: 5 } });
        return `🍽️ Food matches:\n${(data.products || []).map(item => `• ${item.product_name || 'Unnamed'} — ${item.brands || 'brand unknown'}\n${item.url || ''}`).join('\n') || 'No food products found.'}`;
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
    if (name === 'isspass') {
        let data;
        try {
            data = await getJson('https://api.open-notify.org/iss-now.json');
            return `🛰️ ISS location: ${data.iss_position?.latitude}, ${data.iss_position?.longitude} (${data.timestamp ? new Date(data.timestamp * 1000).toISOString() : 'now'}).`;
        } catch (_) {
            data = await getJson('https://api.wheretheiss.at/v1/satellites/25544');
            return `🛰️ ISS location: ${data.latitude}, ${data.longitude} (altitude ${data.altitude ?? 'n/a'} km).`;
        }
    }
    if (name === 'spaceweather') {
        const data = await getJson('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json');
        const latest = Array.isArray(data) ? data[data.length - 1] : data;
        return `☀️ Solar wind: ${latest?.speed || 'n/a'} km/s at ${latest?.time_tag || 'latest reading'}.`;
    }
    if (name === 'stargazing') {
        const location = await geocode(query || 'Lagos');
        const data = await getJson('https://api.open-meteo.com/v1/forecast', {
            params: { latitude: location.latitude, longitude: location.longitude, hourly: 'cloud_cover,visibility', timezone: 'auto', forecast_hours: 12 },
        });
        const cloud = data.hourly?.cloud_cover?.[0];
        return `🔭 ${location.name}: cloud cover ${cloud ?? 'n/a'}% and visibility ${data.hourly?.visibility?.[0] ?? 'n/a'} m in the next forecast window.`;
    }
    if (name === 'flightstatus') {
        const icao = query.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!icao) return '✈️ Usage: `.flightstatus ICAO24`';
        const data = await getJson('https://opensky-network.org/api/states/all', { params: { icao24: icao } });
        const state = data.states?.[0];
        return state ? `✈️ ${state[1] || icao}: ${state[2] || 'unknown'} → ${state[5] ?? '?'}, ${state[6] ?? '?'} at ${state[9] ?? '?'} m/s.` : '✈️ No live aircraft state found.';
    }
    if (name === 'restaurant') {
        const location = await geocode(query || 'Lagos');
        const overpass = `[out:json];(nwr[amenity=restaurant](around:5000,${location.latitude},${location.longitude}););out center 8;`;
        const data = await axios.post('https://overpass-api.de/api/interpreter', overpass, { timeout: 20000, headers: { 'Content-Type': 'text/plain', Accept: 'application/json' } });
        return `🍽️ Restaurants near ${location.name}:\n${(data.data?.elements || []).slice(0, 8).map(item => `• ${item.tags?.name || 'Unnamed restaurant'} — ${item.tags?.cuisine || 'cuisine unknown'}`).join('\n') || 'No nearby restaurants found.'}`;
    }
    if (name === 'rssfollow' || name === 'forumwatch') {
        const url = /^https?:\/\//i.test(query) ? query : `https://${query}`;
        const xml = String((await axios.get(url, { timeout: 15000, headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml' } })).data);
        const items = [...xml.matchAll(/<(?:item|entry)[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>[\s\S]*?(?:<link[^>]*>([\s\S]*?)<\/link>|<link[^>]+href=["']([^"']+)["'])[\s\S]*?<\/(?:item|entry)>/gi)];
        return `📰 Feed preview:\n${items.slice(0, 5).map(item => `• ${item[1].replace(/<[^>]+>/g, '').trim()}\n${(item[2] || item[3] || '').trim()}`).join('\n') || 'No feed entries found.'}`;
    }
    if (name === 'trendwatch') {
        const xml = String((await axios.get('https://trends.google.com/trending/rss?geo=US', { timeout: 15000 })).data);
        const titles = [...xml.matchAll(/<title>([^<]+)<\/title>/gi)].slice(1, 11).map(match => `• ${match[1]}`);
        return `📈 Trending now:\n${titles.join('\n') || 'No trends returned.'}`;
    }
    if (name === 'keywordalert') {
        const [url, ...words] = query.split(/\s+/);
        if (!url || !words.length) return '🔔 Usage: `.keywordalert https://example.com keyword`';
        const html = String((await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'SUKUNA-MD/1.0' } })).data).toLowerCase();
        const found = words.map(word => [word, html.includes(word.toLowerCase())]);
        return `🔔 ${found.map(([word, ok]) => `${ok ? '✅' : '❌'} ${word}`).join('\n')}`;
    }
    if (name === 'socialpulse' || name === 'viralcheck' || name === 'hashtagwatch') {
        const data = await getJson('https://www.reddit.com/search.json', { params: { q: query || 'trending', limit: 10, sort: 'top', t: 'day' } });
        const posts = data.data?.children || [];
        return `📡 Public pulse for ${query || 'trending'}:\n${posts.slice(0, 5).map(item => `• ${item.data?.title} (${item.data?.score || 0} votes)`).join('\n') || 'No public posts found.'}`;
    }
    if (name === 'stockalert') {
        const symbol = (query || 'AAPL').toUpperCase().replace(/[^A-Z0-9.=-]/g, '');
        const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, { params: { range: '1d', interval: '1d' } });
        const meta = data.chart?.result?.[0]?.meta;
        return `📈 ${symbol}: ${meta?.regularMarketPrice ?? 'n/a'} ${meta?.currency || ''} (previous ${meta?.previousClose ?? 'n/a'}).`;
    }
    if (name === 'providerhealth') {
        const started = Date.now();
        await getJson('https://api.github.com/zen');
        return `🩺 Public provider check: GitHub responded in ${Date.now() - started} ms.`;
    }
    if (name === 'githubwatch' || name === 'repoaudit' || name === 'commitdigest') {
        const repo = query.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '').replace(/^\//, '');
        const data = await getJson(`https://api.github.com/repos/${repo}`);
        if (name === 'repoaudit') return `🐙 ${data.full_name}: ${data.language || 'unknown language'}, ⭐ ${data.stargazers_count}, forks ${data.forks_count}, issues ${data.open_issues_count}, updated ${data.updated_at}.`;
        const commits = await getJson(`https://api.github.com/repos/${repo}/commits`, { params: { per_page: 5 } });
        return `🧾 Recent commits for ${data.full_name}:\n${commits.map(item => `• ${item.commit?.message?.split('\\n')[0]} — ${item.sha?.slice(0, 7)}`).join('\n')}`;
    }
    if (name === 'prreview') {
        const match = query.match(/^([^/]+\/[^/]+)\s+#?(\d+)/);
        if (!match) return '🔍 Usage: `.prreview owner/repo 123`';
        const data = await getJson(`https://api.github.com/repos/${match[1]}/pulls/${match[2]}`);
        return `🔎 PR #${data.number}: ${data.title}\nState: ${data.state}, changed files: ${data.changed_files}, additions: ${data.additions}, deletions: ${data.deletions}\n${data.html_url}`;
    }
    if (name === 'releasewatch') {
        const repo = query.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '').replace(/^\//, '');
        const data = await getJson(`https://api.github.com/repos/${repo}/releases/latest`);
        return `🚀 ${data.name || data.tag_name}: ${data.published_at || 'unpublished'}\n${data.html_url}`;
    }
    if (name === 'languageid') {
        const response = await axios.post('https://translate.astian.org/detect', { q: query }, { timeout: 15000, headers: { Accept: 'application/json' } });
        return `🌍 Detected language: ${response.data?.[0]?.language || 'unknown'} (${Math.round((response.data?.[0]?.confidence || 0) * 100)}% confidence).`;
    }
    if (name === 'pronounce') {
        const word = encodeURIComponent(query || 'hello');
        return `🔊 Pronunciation link:\nhttps://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${word}&tl=en`;
    }
    if (name === 'moviewhere') {
        const data = await getJson('https://api.tvmaze.com/search/shows', { params: { q: query || 'breaking bad' } });
        return `🎬 Shows:\n${(data || []).slice(0, 5).map(item => `• ${item.show?.name} — ${item.show?.premiered || 'date unknown'}\n${item.show?.url || ''}`).join('\n') || 'No shows found.'}`;
    }
    if (name === 'showtimes') {
        const data = await getJson('https://api.tvmaze.com/schedule', { params: { country: (query || 'US').toUpperCase().slice(0, 2), date: new Date().toISOString().slice(0, 10) } });
        return `📺 Today’s schedule:\n${(data || []).slice(0, 8).map(item => `• ${item.show?.name} — ${item.airtime || 'time unknown'} (${item.network?.name || item.webChannel?.name || 'network'})`).join('\n') || 'No schedule found.'}`;
    }
    if (name === 'eventsnear') {
        const location = await geocode(query || 'Lagos');
        const overpass = `[out:json];(nwr[amenity~"theatre|arts_centre|community_centre|events_venue"](around:8000,${location.latitude},${location.longitude}););out center 15;`;
        const data = await axios.post('https://overpass-api.de/api/interpreter', overpass, { timeout: 20000, headers: { 'Content-Type': 'text/plain', Accept: 'application/json' } });
        return `📍 Places near ${location.name}:\n${(data.data?.elements || []).slice(0, 10).map(item => `• ${item.tags?.name || 'Unnamed venue'} — ${item.tags?.amenity || 'venue'}`).join('\n') || 'No public venues found.'}`;
    }
    if (name === 'memeimage') {
        const data = await getJson(`https://meme-api.com/gimme/${encodeURIComponent(query || 'memes')}`);
        return `😂 ${data.title || 'Meme'}\n${data.url || ''}`;
    }
    if (name === 'avatarforge') {
        const seed = encodeURIComponent(query || `hinatu-${Date.now()}`);
        return `🧑‍🎨 Avatar ready:\nhttps://api.dicebear.com/9.x/adventurer/png?seed=${seed}&size=512`;
    }
    if (name === 'wallpaper') {
        const seed = encodeURIComponent(query || 'sukuna');
        return `🖼️ Wallpaper concept:\nhttps://image.pollinations.ai/prompt/${seed}%20phone%20wallpaper?width=1080&height=1920&nologo=true`;
    }
    if (name === 'posterforge' || name === 'thumbnail' || name === 'comicstrip') {
        const prompt = encodeURIComponent(query || 'futuristic SUKUNA MD technology poster');
        return `🎨 Generated visual:\nhttps://image.pollinations.ai/prompt/${prompt}?width=1280&height=720&nologo=true`;
    }
    if (name === 'stickersearch') {
        const tag = (query || 'smile').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const data = await getJson('https://api.otakugifs.xyz/gif', { params: { reaction: tag } });
        return `🎟️ Sticker/GIF result:\n${data.url || 'No sticker found.'}`;
    }
    if (name === 'sourcecheck') {
        const data = await getJson('https://en.wikipedia.org/w/api.php', { params: { action: 'query', list: 'search', srsearch: query, format: 'json', origin: '*' } });
        return `📚 Sources:\n${(data.query?.search || []).slice(0, 5).map(item => `• ${item.title}\nhttps://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`).join('\n') || 'No sources found.'}`;
    }
    if (name === 'pricewatch' || name === 'dealalert') {
        const url = /^https?:\/\//i.test(query) ? query : null;
        if (!url) return `💸 Usage: .${name} https://product-page-url`;
        const response = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (SUKUNA-MD price checker)' } });
        const html = String(response.data);
        const prices = [...html.matchAll(/(?:₦|\$|€|£)\s?[0-9][0-9,.]*/g)].slice(0, 5).map(match => match[0]);
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return `💰 ${titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || 'Product'}\nPrices found: ${prices.join(', ') || 'not detected'}\n${url}`;
    }
    if (name === 'linkdigest' || name === 'scrape') {
        const url = /^https?:\/\//i.test(query) ? query : `https://${query}`;
        const response = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'SUKUNA-MD/1.0' } });
        const text = String(response.data).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
        if (name === 'scrape') return `🕷️ Page text:\n${text.slice(0, 1200)}${text.length > 1200 ? '…' : ''}`;
        const { ask } = require('./smartAI');
        const summary = await ask({ key: `linkdigest:${url}`, user: text, compact: true, system: 'Summarize this webpage in 3 short, factual sentences. Do not invent details.' });
        return `🔗 ${summary || 'Page fetched successfully.'}\n${url}`;
    }
    if (name === 'wordoftheday') {
        const word = (await getJson('https://random-word-api.herokuapp.com/word', { params: { number: 1 } }))[0];
        const data = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        return `📘 Word of the day: *${word}*\n${data[0]?.meanings?.[0]?.definitions?.[0]?.definition || 'Definition unavailable.'}`;
    }
    if (name === 'onthisday') {
        const now = new Date();
        const data = await getJson(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}`);
        return `📅 On this day:\n${(data.events || []).slice(0, 5).map(item => `• ${item.year}: ${item.text}`).join('\n') || 'No events found.'}`;
    }
    if (name === 'culturecard') {
        const place = query || 'Nigeria';
        const data = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(place.replace(/\s+/g, '_'))}`);
        return `🌍 ${data.title}\n${String(data.extract || 'No culture summary found.').slice(0, 900)}\n${data.content_urls?.desktop?.page || ''}`;
    }
    if (name === 'comicofday') {
        const data = await getJson('https://xkcd.com/info.0.json');
        return `🗯️ *${data.title}*\n${data.alt || ''}\n${data.img || ''}`;
    }
    if (name === 'recipe' || name === 'mealplan') {
        const endpoint = query ? `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}` : 'https://www.themealdb.com/api/json/v1/1/random.php';
        const data = await getJson(endpoint);
        const meal = data.meals?.[0];
        return meal ? `🍲 ${meal.strMeal}\nCategory: ${meal.strCategory || 'n/a'}\nArea: ${meal.strArea || 'n/a'}\n${meal.strYoutube || ''}` : '🍲 No recipe found.';
    }
    if (name === 'dependencycheck') {
        const packageName = query || 'express';
        const data = await getJson(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
        return `📦 ${data.name}: latest ${data['dist-tags']?.latest || 'n/a'}\nUpdated: ${data.time?.modified || 'n/a'}\n${data.repository?.url || ''}`;
    }
    if (name === 'licensecheck') {
        const repo = query.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '').replace(/^\//, '');
        const data = await getJson(`https://api.github.com/repos/${repo}/license`);
        return `⚖️ ${repo}: ${data.license?.spdx_id || data.license?.name || 'license not detected'}\n${data.html_url || ''}`;
    }
    if (name === 'readmegen') {
        const repo = query.replace(/^https?:\/\/github.com\//i, '').replace(/\.git$/, '').replace(/^\//, '');
        const data = await getJson(`https://api.github.com/repos/${repo}/readme`, { headers: { Accept: 'application/vnd.github.raw+json' } });
        const text = Buffer.from(data.content || '', 'base64').toString('utf8');
        return `📖 README preview for ${repo}:\n${text.slice(0, 1800)}${text.length > 1800 ? '…' : ''}`;
    }
    if (name === 'apikeytest') {
        const keys = ['GROQ_API_KEY','GEMINI_API_KEY','OPENAI_API_KEY','OPENROUTER_API_KEY','AI_GATEWAY_API_KEY','WEATHER_API_KEY'];
        return `🔑 Provider keys:\n${keys.map(key => `${process.env[key] ? '✅' : '❌'} ${key}`).join('\n')}`;
    }
    if (name === 'weatheralerts') {
        const location = await geocode(query || 'Lagos');
        const data = await getJson('https://api.open-meteo.com/v1/forecast', { params: { latitude: location.latitude, longitude: location.longitude, daily: 'precipitation_probability_max,wind_speed_10m_max,weather_code', timezone: 'auto', forecast_days: 3 } });
        return `⚠️ Weather outlook for ${location.name}:\n${(data.daily?.time || []).map((date, index) => `• ${date}: rain ${data.daily?.precipitation_probability_max?.[index] ?? '?'}%, wind ${data.daily?.wind_speed_10m_max?.[index] ?? '?'} km/h, code ${data.daily?.weather_code?.[index] ?? '?'}`).join('\n')}`;
    }
    if (name === 'travelplan') {
        const location = await geocode(query || 'Lagos');
        const data = await getJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(location.name));
        return `🧳 ${location.name}: ${String(data.extract || 'Destination found.').slice(0, 700)}\n${data.content_urls?.desktop?.page || ''}`;
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

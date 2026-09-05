'use strict';

// Pinterest-style image search without a browser, login, API key, or heavy scraper.
// Wikimedia Commons provides stable public thumbnails and a searchable API.
const COOLDOWN_MS = 45_000;
const SEND_DELAY_MS = 1_200;
const MAX_RESULTS = 6;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const cooldowns = new Map();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function trimCooldowns() {
    const now = Date.now();
    for (const [key, expires] of cooldowns) if (expires <= now) cooldowns.delete(key);
}

async function searchCommons(query) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrnamespace: '6',
        gsrlimit: '30',
        prop: 'imageinfo',
        iiprop: 'url|mime|size',
        iiurlwidth: '900',
        format: 'json',
        origin: '*',
    });

    const response = await fetch(url, {
        headers: { 'User-Agent': 'SUKUNA-MD/3.0 image-search' },
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`image search returned HTTP ${response.status}`);

    const payload = await response.json();
    const pages = Object.values(payload?.query?.pages || {});
    const seen = new Set();
    return pages.map(page => {
        const info = page?.imageinfo?.[0] || {};
        const mime = String(info.mime || '').toLowerCase();
        return {
            title: String(page?.title || '').replace(/^File:/i, '').trim(),
            url: info.thumburl || info.url,
            mime,
            size: Number(info.size) || 0,
        };
    }).filter(item => {
        if (!item.url || !/^image\/(?:jpeg|jpg|png|webp|gif)$/i.test(item.mime)) return false;
        if (item.size > MAX_IMAGE_BYTES || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    }).slice(0, MAX_RESULTS);
}

async function fetchImage(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'SUKUNA-MD/3.0 image-search' },
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`image returned HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error('search result was not an image');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_IMAGE_BYTES) throw new Error('image is too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('invalid image size');
    return buffer;
}

module.exports = {
    name: 'pint',
    aliases: ['pinterest', 'pin', 'pins'],
    description: 'Find six Pinterest-style images for a search prompt',
    usage: '.pint Elon Musk | .pint Billie Eilish | .pint BMW',
    category: 'general',

    async execute({ sock, msg, from, sender, args, reply }) {
        trimCooldowns();
        const query = String(args?.join?.(' ') || '').trim().replace(/\s+/g, ' ');
        if (!query) return reply('🖼️ Usage: *.pint Elon Musk*\nSend six image results for your prompt.');
        if (query.length > 120) return reply('❌ Keep the image search prompt under 120 characters.');

        const key = `${from || 'chat'}:${sender || 'user'}`;
        const expires = cooldowns.get(key) || 0;
        if (expires > Date.now()) {
            return reply(`⏳ Please wait *${Math.ceil((expires - Date.now()) / 1000)}s* before using .pint again.`);
        }
        cooldowns.set(key, Date.now() + COOLDOWN_MS);

        try {
            await reply(`🔎 Searching six images for *${query}*...`);
            const results = await searchCommons(query);
            if (!results.length) return reply(`❌ No safe image results found for *${query}*. Try a broader prompt.`);

            const pinterestUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
            const cards = [];
            for (const result of results) {
                try {
                    const buffer = await fetchImage(result.url);
                    cards.push({
                        image: buffer,
                        caption: `📌 *${query}*\n${cards.length + 1}/${results.length}${result.title ? `\n_${result.title.slice(0, 120)}_` : ''}`,
                        footer: 'SUKUNA MD · Pinterest search',
                        nativeFlow: [{ text: 'View web', url: pinterestUrl, useWebview: true }],
                    });
                    // Pace downloads so a slow source cannot create a burst of work.
                    if (cards.length < results.length) await sleep(SEND_DELAY_MS);
                } catch (error) {
                    console.error('[pint:image]', error.message);
                }
            }
            if (!cards.length) {
                cooldowns.delete(key);
                return reply('❌ The image source returned unusable results. Try again with another prompt.');
            }
            try {
                await sock.sendMessage(from, {
                    // Pasqua Baileys uses the outer text field to enter its
                    // interactive-message pipeline before processing `cards`.
                    text: `📌 *${query}*\nSwipe horizontally through ${cards.length} results below.`,
                    footer: 'SUKUNA MD · PINTEREST-STYLE SEARCH',
                    cards,
                }, { quoted: msg });
            } catch (carouselError) {
                // Keep the command usable on clients that reject carousel cards.
                console.error('[pint:carousel]', carouselError.message);
                for (const card of cards) {
                    await sock.sendMessage(from, {
                        image: card.image,
                        caption: card.caption,
                        nativeFlow: card.nativeFlow,
                    }, { quoted: msg });
                    await sleep(SEND_DELAY_MS);
                }
            }
        } catch (error) {
            cooldowns.delete(key);
            console.error('[pint]', error.message);
            return reply('❌ Image search is temporarily unavailable. Please try again shortly.');
        }
    },

    _private: { searchCommons, fetchImage, cooldowns },
};

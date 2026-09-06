'use strict';

const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@pasqua-baileys/baileys');

// Pinterest image carousel powered exclusively by the public Prexzy Pinterest
// search endpoint. The provider returns direct image URLs; this command
// downloads and validates those images before building the WhatsApp carousel.
//
// NOTE ON IMPLEMENTATION: the top-level `cards` / `nativeFlow` shorthand from
// the fork's README (passed straight into sock.sendMessage) is NOT used here.
// Every other interactive command in this codebase (dial.js, peek.js,
// channelid.js, roadmapButtons.js) builds the raw
// proto.Message.InteractiveMessage by hand instead of relying on that
// shorthand — that's a strong signal it doesn't render reliably on this
// fork/version. This file follows the same proven low-level pattern so the
// carousel actually reaches WhatsApp as a real interactiveMessage.carouselMessage.
const COOLDOWN_MS = 45_000;
const FETCH_DELAY_MS = 500; // polite stagger between Wikimedia requests, not a send delay
const MAX_RESULTS = 6; // matches the command's own description ("six image results")
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const USER_AGENT = 'SUKUNA-MD/3.0 image-search';
const FETCH_TIMEOUT_MS = 15_000;
const cooldowns = new Map();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function trimCooldowns() {
    const now = Date.now();
    for (const [key, expires] of cooldowns) if (expires <= now) cooldowns.delete(key);
}

async function fetchJson(url, label) {
    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    return response.json();
}

function normalizeForMatch(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, ''); // strip accents so e.g. "Beyonce" matches "Beyoncé"
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True only if every word of `query` shows up in `title` as a whole word.
// This is the actual guard against the "wrong Tyla" bug: CirrusSearch (the
// Commons search engine) silently widens a search like `Tyla` with fuzzy/
// stemmed variants when the exact query is thin on results, which is how
// unrelated namesakes and lookalike words (e.g. "Tyler", "Tylawa") slip in.
// Wrapping the query in quotes (see quotePhrase) cuts most of that off at
// the source; this filter is the last line of defense for anything that
// still gets through via category/description matches rather than the title.
function titleMatchesQuery(title, query) {
    const normTitle = ` ${normalizeForMatch(title)} `;
    const words = normalizeForMatch(query).split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    return words.every(word => {
        const pattern = new RegExp(`[^a-z0-9]${escapeRegExp(word)}[^a-z0-9]`, 'i');
        return pattern.test(normTitle);
    });
}

function quotePhrase(query) {
    // Phrase search disables CirrusSearch's fuzzy/stemmed expansion, which is
    // the main source of off-topic results for short, name-like queries.
    return `"${query.replace(/"/g, '')}"`;
}

async function searchCommons(query, { intitleOnly = false } = {}) {
    const gsrsearch = intitleOnly ? `intitle:${quotePhrase(query)}` : quotePhrase(query);
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch,
        gsrnamespace: '6',
        gsrlimit: '40',
        prop: 'imageinfo',
        iiprop: 'url|mime|size',
        iiurlwidth: '900',
        format: 'json',
        origin: '*',
    });

    const payload = await fetchJson(url, 'image search');
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
        if (!titleMatchesQuery(item.title, query)) return false;
        seen.add(item.url);
        return true;
    }).slice(0, MAX_RESULTS);
}

// Text search, tightened: try filenames-only first (highest precision), and
// only widen to categories/descriptions if that comes back empty.
async function searchCommonsPrecise(query) {
    const strict = await searchCommons(query, { intitleOnly: true });
    if (strict.length) return strict;
    return searchCommons(query, { intitleOnly: false });
}

// Resolve the query to a real topic via Wikipedia's own search (which
// handles name collisions/disambiguation far better than Commons' raw
// full-text search does), then read off the Wikidata item behind it.
async function resolveWikidataId(query) {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrlimit: '1',
        gsrnamespace: '0',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        format: 'json',
        origin: '*',
    });
    const payload = await fetchJson(url, 'topic lookup');
    const pages = Object.values(payload?.query?.pages || {});
    const qid = pages[0]?.pageprops?.wikibase_item;
    return qid || null;
}

// Pull the two Wikidata claims that point at *verified* photos of that exact
// entity: P18 (a single canonical infobox image) and P373 (the Commons
// category dedicated to that person/thing specifically, not just anyone
// who shares their name).
async function fetchWikidataClaims(qid) {
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.search = new URLSearchParams({
        action: 'wbgetclaims',
        entity: qid,
        property: 'P18|P373',
        format: 'json',
        origin: '*',
    });
    const payload = await fetchJson(url, 'entity lookup');
    const image = payload?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
    const category = payload?.claims?.P373?.[0]?.mainsnak?.datavalue?.value || null;
    return { image, category };
}

async function fetchCommonsFileInfo(fileTitle) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({
        action: 'query',
        titles: `File:${fileTitle}`,
        prop: 'imageinfo',
        iiprop: 'url|mime|size',
        iiurlwidth: '900',
        format: 'json',
        origin: '*',
    });
    const payload = await fetchJson(url, 'image lookup');
    const pages = Object.values(payload?.query?.pages || {});
    const info = pages[0]?.imageinfo?.[0];
    if (!info) return null;
    const mime = String(info.mime || '').toLowerCase();
    if (!/^image\/(?:jpeg|jpg|png|webp|gif)$/i.test(mime) || Number(info.size) > MAX_IMAGE_BYTES) return null;
    return { title: fileTitle, url: info.thumburl || info.url, mime, size: Number(info.size) || 0 };
}

async function fetchCommonsCategoryImages(category, limit) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({
        action: 'query',
        generator: 'categorymembers',
        gcmtitle: `Category:${category}`,
        gcmtype: 'file',
        gcmlimit: String(limit),
        prop: 'imageinfo',
        iiprop: 'url|mime|size',
        iiurlwidth: '900',
        format: 'json',
        origin: '*',
    });
    const payload = await fetchJson(url, 'category lookup');
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
    });
}

// The actual fix for the "wrong Tyla" bug: instead of asking Commons "what
// files mention this word" (fuzzy, name-collision-prone), first ask
// Wikipedia/Wikidata "what specific person/thing is this", then only pull
// images already verified to belong to *that* entity. Falls back to nothing
// (never throws) so the caller always has the tightened text search as a
// safety net — e.g. generic queries with no Wikidata item at all.
async function findEntityImages(query, limit) {
    try {
        const qid = await resolveWikidataId(query);
        if (!qid) return [];
        const { image, category } = await fetchWikidataClaims(qid);

        const results = [];
        const seen = new Set();
        if (image) {
            const info = await fetchCommonsFileInfo(image);
            if (info && !seen.has(info.url)) { results.push(info); seen.add(info.url); }
        }
        if (category && results.length < limit) {
            const more = await fetchCommonsCategoryImages(category, limit * 2);
            for (const item of more) {
                if (results.length >= limit) break;
                if (seen.has(item.url)) continue;
                results.push(item);
                seen.add(item.url);
            }
        }
        return results.slice(0, limit);
    } catch (error) {
        console.error('[pint:entity-resolve]', error?.message || error);
        return [];
    }
}

// Last-resort fallback: Openverse aggregates CC-licensed images from Flickr,
// Wikimedia, and other open sources through a real public API (no key, no
// scraping). Broader real-world/event-photo coverage than Commons alone,
// since press photographers CC-license shots to Flickr that never make it
// to Commons. Same title-match guard as the Commons search, for the same
// reason: a full-text `q` search can still surface a same-named unrelated
// result, so we only keep hits whose title actually contains the query.
async function fetchOpenverseImages(query, limit) {
    const url = new URL('https://api.openverse.org/v1/images/');
    url.search = new URLSearchParams({
        q: query,
        page_size: String(Math.max(limit * 3, 20)), // overfetch, then filter down
    });
    const payload = await fetchJson(url, 'Openverse search');
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const seen = new Set();
    return results.map(item => ({
        title: String(item?.title || '').trim(),
        url: item?.thumbnail || item?.url,
        mime: '', // Openverse doesn't give this upfront; fetchImage() checks the real content-type at download time
        size: 0,
    })).filter(item => {
        if (!item.url || seen.has(item.url)) return false;
        if (!titleMatchesQuery(item.title, query)) return false;
        seen.add(item.url);
        return true;
    }).slice(0, limit);
}

// Sole Pinterest search provider. The command keeps its existing WhatsApp
// carousel and individual-image fallback, but all search results come from the
// user-provided Prexzy endpoint.
async function findImages(query) {
    const url = new URL('https://prexzyapis.com/search/pinterest');
    url.search = new URLSearchParams({ q: query });
    const payload = await fetchJson(url, 'Prexzy Pinterest search');
    if (payload?.status !== true || Number(payload?.statusCode) !== 200 || !Array.isArray(payload?.data)) {
        throw new Error('Prexzy returned an invalid Pinterest response');
    }

    const seen = new Set();
    return payload.data
        .map(value => String(value || '').trim())
        .filter(value => /^https?:\/\/[^\s]+$/i.test(value) && !seen.has(value) && seen.add(value))
        .slice(0, MAX_RESULTS)
        .map((imageUrl, index) => ({
            url: imageUrl,
            title: `${query} · result ${index + 1}`,
            mime: '',
            size: 0,
        }));
}

async function fetchImage(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

// Standard WhatsApp native-flow "open URL" button. Same shape already used
// successfully in peek.js, gcall.js, and utility/linkpreview.js.
function ctaUrl(displayText, url) {
    return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: url }),
    };
}

// The <biz><interactive type="native_flow" .../></biz> stanza node.
// WhatsApp Web/Desktop have been documented (see WhatsApp interactive-message
// implementations built on Baileys, e.g. evolution-api's carousel/button fix)
// to sometimes drop nativeFlow/carousel content that's relayed WITHOUT this
// extra node — only iOS/Android reliably auto-infer it. Passing it via
// additionalNodes costs nothing if this fork's relayMessage ignores unknown
// options, and can only help cross-client rendering.
function nativeFlowBizNode() {
    return [{
        tag: 'biz',
        attrs: {},
        content: [{
            tag: 'interactive',
            attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
        }],
    }];
}

async function buildCard({ sock, buffer, index, total, query, title, pinterestUrl }) {
    const { imageMessage } = await prepareWAMessageMedia(
        { image: buffer },
        { upload: sock.waUploadToServer }
    );
    return {
        header: proto.Message.InteractiveMessage.Header.fromObject({
            title: '',
            hasMediaAttachment: true,
            imageMessage,
        }),
        body: proto.Message.InteractiveMessage.Body.fromObject({
            text: `📌 *${query}*\n${index}/${total}${title ? `\n_${title.slice(0, 120)}_` : ''}`,
        }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({
            text: 'Pinterest · SUKUNA MD',
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [ctaUrl('Open in Pinterest', pinterestUrl)],
        }),
    };
}

async function sendCarousel({ sock, msg, from, query, cards }) {
    // Guard: some Baileys builds are compiled against an older WAProto that
    // has no CarouselMessage field at all. Fail loudly here instead of
    // letting a silent proto mismatch swallow the whole send.
    if (!proto?.Message?.InteractiveMessage?.CarouselMessage) {
        throw new Error('This Baileys build has no proto.Message.InteractiveMessage.CarouselMessage — carousel is not supported by the installed library version.');
    }

    const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
        body: { text: `📌 *${query}*\nSwipe through ${cards.length} results below.` },
        footer: { text: 'SUKUNA MD · PINTEREST-STYLE SEARCH' },
        header: { title: '✦ PINTEREST-STYLE SEARCH ✦', hasMediaAttachment: false },
        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards }),
    });

    const wrapped = generateWAMessageFromContent(from, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                interactiveMessage,
            },
        },
    }, { userJid: sock.user?.id, quoted: msg });

    await sock.relayMessage(from, wrapped.message, {
        messageId: wrapped.key.id,
        additionalNodes: nativeFlowBizNode(),
    });
}

// Last-resort fallback if the carousel proto itself can't be built/sent on
// this Baileys build — still gives the user their images instead of nothing.
async function sendFallbackImages({ sock, msg, from, query, buffers, pinterestUrl }) {
    for (let i = 0; i < buffers.length; i++) {
        await sock.sendMessage(from, {
            image: buffers[i].buffer,
            caption: `📌 *${query}*\n${i + 1}/${buffers.length}${buffers[i].title ? `\n_${buffers[i].title.slice(0, 120)}_` : ''}\n\n🔗 ${pinterestUrl}`,
        }, i === 0 ? { quoted: msg } : undefined);
        if (i < buffers.length - 1) await sleep(400);
    }
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
            const results = await findImages(query);
            if (!results.length) {
                cooldowns.delete(key);
                return reply(`❌ No safe image results found for *${query}*. Try a broader prompt.`);
            }

            const pinterestUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;

            // Download every image up front (into memory — no temp files needed;
            // prepareWAMessageMedia accepts a Buffer directly).
            const fetched = [];
            for (const result of results) {
                try {
                    const buffer = await fetchImage(result.url);
                    fetched.push({ buffer, title: result.title });
                    if (fetched.length < results.length) await sleep(FETCH_DELAY_MS);
                } catch (error) {
                    console.error('[pint:fetch]', result.url, error?.message || error);
                }
            }

            if (!fetched.length) {
                cooldowns.delete(key);
                return reply('❌ The image source returned unusable results. Try again with another prompt.');
            }

            // Build the real interactiveMessage.carouselMessage cards (uploads
            // each image to WhatsApp's media servers via prepareWAMessageMedia).
            let cards;
            try {
                cards = await Promise.all(fetched.map((item, i) =>
                    buildCard({
                        sock,
                        buffer: item.buffer,
                        index: i + 1,
                        total: fetched.length,
                        query,
                        title: item.title,
                        pinterestUrl,
                    })
                ));
            } catch (error) {
                console.error('[pint:build-cards]', error);
                cooldowns.delete(key);
                return reply('❌ Could not prepare the images for the carousel. Try again shortly.');
            }

            try {
                await sendCarousel({ sock, msg, from, query, cards });
            } catch (error) {
                // Full error (not just .message) so the real proto/library
                // mismatch is visible in logs instead of being hidden behind a
                // generic message.
                console.error('[pint:carousel]', error);
                await reply('⚠️ Carousel isn\'t supported by this Baileys build — sending the images individually instead.');
                await sendFallbackImages({ sock, msg, from, query, buffers: fetched, pinterestUrl });
            }

        } catch (error) {
            cooldowns.delete(key);
            console.error('[pint]', error);
            return reply('❌ Image search is temporarily unavailable. Please try again shortly.');
        }
    },

    _private: {
        findImages,
        fetchImage, cooldowns, ctaUrl, buildCard, sendCarousel,
    },
};

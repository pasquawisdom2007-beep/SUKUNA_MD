'use strict';

const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@pasqua-baileys/baileys');

// Pinterest-style image carousel without a browser, login, API key, or heavy
// scraper. Wikimedia Commons provides stable public thumbnails and a
// searchable API.
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
            const results = await searchCommons(query);
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

    _private: { searchCommons, fetchImage, cooldowns, ctaUrl, buildCard, sendCarousel },
};

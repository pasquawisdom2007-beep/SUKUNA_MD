/**
 * .aisearch <query> — web search rendered as the same GenAI rich card
 * mechanism as .insta's lookup chip (commands/media/instagram.js), instead
 * of .google's plain text+image reply.
 *
 * Reuses .google's own data sources (DuckDuckGo instant answer + Wikipedia
 * summary — see commands/media/google.js's exported `_sources`) so results
 * stay consistent between the two commands; only the rendering differs.
 */
'use strict';

const { generateWAMessageFromContent, proto } = require('@pasqua-dev/baileys');
const google = require('./google');

const { ddg, wiki, ogImage } = google._sources;

function isHttpUrl(value) { return typeof value === 'string' && /^https?:\/\//i.test(value.trim()); }

function hostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return url; }
}

// Same GenAICompactEntityPrimitive used for the header row of the Instagram
// lookup chip — one row per result here instead of one fixed entity.
function entityRow(title, subtitle, url) {
    return {
        view_model: {
            primitives: [{
                title: String(title || url).slice(0, 90),
                subtitle: String(subtitle || '').slice(0, 90),
                secondary_subtitle: '',
                entity_id: String(url),
                entity_url: String(url || '').replace(/^https?:\/\//, ''),
                entity_type: 'WEBSITE',
                action_type: 'OPEN_URL',
                is_verified: false,
                __typename: 'GenAICompactEntityPrimitive',
            }],
            __typename: 'GenAIActionRowLayoutViewModel',
        },
    };
}

// Header row — same primitive as entityRow, plus the preview image slot
// (the image field is artwork, entity_url is the tap target; keep them
// separate rather than overloading one param for both).
function headerRow(title, subtitle, imageUrl, linkUrl) {
    const row = entityRow(title, subtitle, linkUrl || imageUrl);
    row.view_model.primitives[0].is_verified = true;
    row.view_model.primitives[0].image = { url: imageUrl, mime_type: 'image/png' };
    return row;
}

function dividerRow() {
    return {
        view_model: {
            primitives: [{ type: 'HORIZONTAL_LINE', __typename: 'GenAIDividerPrimitive' }],
            __typename: 'GenAIVStackLayoutViewModel',
        },
    };
}

// Same "See results" markdown link row as the Instagram lookup card, just
// without an IG_PROFILE-style special entity (there isn't a generic-web
// equivalent) — entity_type stays 'WEBSITE', same as the other rows here.
// Links to a real search-results page so it's still useful as a "see more"
// beyond the top rows already shown.
function seeResultsRow(query, { name, image }) {
    const resultsUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    return {
        view_model: {
            primitives: [
                { __typename: 'GenAISpacerPrimitive' },
                {
                    text: '# {{search_entity_1}}See results\0{{/search_entity_1}}    ',
                    inline_entities: [{
                        key: 'search_entity_1',
                        metadata: {
                            __typename: 'GenAISocialEntityItem',
                            entity_id: query,
                            entity_name: query,
                            entity_full_name: name || query,
                            entity_picture_url: image || '',
                            entity_url: resultsUrl,
                            entity_type: 'WEBSITE',
                            is_verified: false,
                        },
                    }],
                    __typename: 'GenAIMarkdownTextUXPrimitive',
                },
                { __typename: 'GenAISpacerPrimitive' },
            ],
            __typename: 'GenAIActionRowLayoutViewModel',
        },
    };
}

// Same shape as instagram.js's buildInstagramGenAILookupContent: a header
// entity card (topic + preview image), a divider, result rows, then a
// "See results" link row.
function buildSearchGenAILookupContent(query, { heading, subtitle, image, sites }) {
    const previewImage = isHttpUrl(image) ? image : `https://unavatar.io/duckduckgo/${encodeURIComponent(query)}`;
    const sections = [
        headerRow(heading || query, subtitle || 'By Pasqua Tech', previewImage, sites[0]?.url),
        dividerRow(),
        ...sites.slice(0, 5).map(site => entityRow(site.title, hostname(site.url), site.url)),
        seeResultsRow(query, { name: heading, image: previewImage }),
    ];

    const data = Buffer.from(JSON.stringify({ sections })).toString('base64');

    return proto.Message.fromObject({
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [],
                    unifiedResponse: { data },
                    contextInfo: { isForwarded: true, forwardOrigin: 4 },
                },
            },
        },
    });
}

async function sendSearchGenAILookup({ sock, jid, quoted, query, heading, subtitle, image, sites }) {
    const content = buildSearchGenAILookupContent(query, { heading, subtitle, image, sites });
    const safeQuoted = quoted?.message ? quoted : undefined;
    const wrapped = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted: safeQuoted });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

module.exports = {
    name: 'aisearch',
    aliases: ['asearch', 'searchai'],
    description: 'Web search rendered as a rich GenAI card (like .insta) instead of a plain caption',
    category: 'media',
    usage: '.aisearch <query>',

    async execute({ sock, msg, from, reply, args }) {
        const query = (args || []).join(' ').trim();
        if (!query) return reply('🔎 Usage: .aisearch <anything>\nExample: .aisearch jujutsu kaisen');

        await sock.sendMessage(from, { react: { text: '🔎', key: msg.key } }).catch(() => {});
        try {
            const [d, w] = await Promise.all([ddg(query), wiki(query)]);
            const heading = w?.title || d?.heading || query;
            const abstract = (w?.extract && w.extract.length >= (d?.abstract?.length || 0)) ? w.extract : (d?.abstract || w?.extract || '');

            const sites = [];
            const pushSite = (title, url) => {
                if (!url || !/^https?:\/\//.test(url)) return;
                if (sites.some(s => s.url === url)) return;
                sites.push({ title: title || url, url });
            };
            if (w?.url) pushSite(`${w.title} — Wikipedia`, w.url);
            if (d?.url) pushSite(`${d.source || heading} — ${heading}`, d.url);
            for (const r of d?.results || []) pushSite(r.title, r.url);

            if (!abstract && sites.length === 0) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
                return reply(`❌ No results found for *${query}*. Try different keywords.`);
            }

            let image = w?.image || d?.image || '';
            if (!image && sites[0]) image = await ogImage(sites[0].url).catch(() => '');

            try {
                await sendSearchGenAILookup({
                    sock, jid: from, quoted: msg, query, heading,
                    subtitle: abstract ? abstract.slice(0, 90) : 'By Pasqua Tech',
                    image, sites,
                });
            } catch (genaiError) {
                console.warn('[aisearch] GenAI card failed:', genaiError.message);
                await reply(`🔎 *${heading}*\n\n${abstract.slice(0, 400)}\n\n${sites.slice(0, 5).map((s, i) => `${i + 1}. ${s.url}`).join('\n')}`);
            }
            return sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (error) {
            console.error('[aisearch]', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply(`❌ Search failed for *${query}*. Try again in a moment.`);
        }
    },
};

module.exports.buildSearchGenAILookupContent = buildSearchGenAILookupContent;
module.exports.sendSearchGenAILookup = sendSearchGenAILookup;

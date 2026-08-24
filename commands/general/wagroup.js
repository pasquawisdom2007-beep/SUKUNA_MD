'use strict';

const API_URL = 'https://prexzyapis.com/search/wagroup';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESULTS = 5;

function text(value, fallback = 'Not provided', maxLength = 900) {
    const valueText = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    if (!valueText) return fallback;
    return valueText.length > maxLength ? `${valueText.slice(0, maxLength - 1).trimEnd()}…` : valueText;
}

function safeUrl(value) {
    const valueText = String(value ?? '').trim();
    return /^https?:\/\//i.test(valueText) ? valueText : '';
}

function list(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => text(item, '', 80)).filter(Boolean);
}

function renderResult(item, index) {
    const details = item?.details && typeof item.details === 'object' ? item.details : {};
    const joinLink = safeUrl(item?.join_link) || safeUrl(item?.invite_link);
    const tags = list(item?.tags);
    const lines = [
        `${index}. *${text(item?.title, 'Untitled WhatsApp group', 180)}*`,
        `🌍 *Country:* ${text(details.country || tags.find(tag => /^[A-Za-z][A-Za-z .'-]{1,30}$/.test(tag)), 'Not provided', 80)}`,
        `🗣️ *Language:* ${text(details.language, 'Not provided', 80)}`,
        `🏷️ *Category:* ${text(details.category, 'Not provided', 100)}`,
        `📝 *Description:* ${text(item?.description, 'No description available', 900)}`,
    ];
    if (tags.length) lines.push(`🔖 *Tags:* ${tags.join(', ')}`);
    if (joinLink) lines.push(`🔗 *Join group:* ${joinLink}`);
    return lines.join('\n');
}

function renderResponse(query, data, results) {
    const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : results.length;
    const body = results.map((item, index) => renderResult(item, index + 1)).join('\n\n──────────────\n\n');
    return `🔎 *WhatsApp Group Search*\n\n*Query:* ${text(query, 'Unknown', 160)}\n*Found:* ${total}\n\n${body}\n\n_Results provided by Prexzy APIs._`;
}

async function fetchResults(query) {
    const url = `${API_URL}?query=${encodeURIComponent(query)}&limit=${MAX_RESULTS}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'SUKUNA-MD/3.0',
            },
            signal: controller.signal,
        });
        let data;
        try {
            data = await response.json();
        } catch (_) {
            throw new Error('The group-search service returned an invalid response.');
        }
        if (!response.ok || data?.status === false) {
            throw new Error(text(data?.error, `Search service returned HTTP ${response.status}.`, 180));
        }
        const results = Array.isArray(data?.results) ? data.results.slice(0, MAX_RESULTS) : [];
        return { data, results };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    name: 'wagroup',
    description: 'Search WhatsApp groups by keyword and show their details',
    category: 'general',
    usage: '.wagroup <query>',

    async execute({ sock, msg, from, reply, args }) {
        const query = Array.isArray(args) ? args.join(' ').trim() : '';
        if (!query) {
            return reply('🔎 *WhatsApp Group Search*\n\nUsage: .wagroup <query>\nExample: .wagroup technology');
        }
        if (query.length > 120) {
            return reply('❌ Keep the search query under 120 characters.');
        }

        try {
            const { data, results } = await fetchResults(query);
            if (!results.length) {
                return reply(`🔎 No WhatsApp groups were found for *${text(query, 'that query', 160)}*.`);
            }

            const caption = renderResponse(query, data, results);
            const image = results.length === 1 ? safeUrl(results[0]?.image) : '';
            if (image) {
                try {
                    return await sock.sendMessage(from, {
                        image: { url: image },
                        caption,
                    }, { quoted: msg });
                } catch (_) {
                    // Fall back to text when an upstream group image has expired.
                }
            }
            return reply(caption);
        } catch (error) {
            console.error('[wagroup]', error.message);
            const message = error.name === 'AbortError'
                ? '⏱️ The group-search service took too long to respond. Please try again.'
                : '❌ WhatsApp group search is temporarily unavailable. Please try again shortly.';
            return reply(message);
        }
    },
};

module.exports.fetchResults = fetchResults;
module.exports.renderResponse = renderResponse;

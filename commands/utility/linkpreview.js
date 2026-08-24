'use strict';

const axios = require('axios');
const { generateWAMessageFromContent, generateWAMessageContent, proto } = require('@pasqua-baileys/baileys');

const MAX_HTML = 2 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;

function findUrl(text) {
    const match = String(text || '').match(/https?:\/\/[^\s<>]+/i);
    if (!match) return null;
    try {
        const url = new URL(match[0].replace(/[),.!?]+$/, ''));
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url;
    } catch (_) {
        return null;
    }
}

function attribute(source, key, value) {
    const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<meta[^>]+(?:${key}\\s*=\\s*["']${escaped}["'][^>]*|${key}\\s*=\\s*["'][^"']+["'][^>]*${value}\\s*=\\s*["']([^"']+)["'])[^>]*>`, 'i');
    const tag = source.match(pattern)?.[0] || '';
    return (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
}

function metaContent(source, names) {
    for (const name of names) {
        const direct = attribute(source, 'property', name) || attribute(source, 'name', name);
        if (direct) return direct.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
    }
    return '';
}

function htmlTitle(source) {
    return ((source.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();
}

function shorten(value, max = 800) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function quickReply(displayText, id) {
    return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: displayText, id }) };
}

function ctaUrl(displayText, url) {
    return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: url }) };
}

async function sendCard({ sock, msg, from, prefix, url, title, description, site, image }) {
    const lines = [
        '🔗 *LINK PREVIEW*',
        '',
        `*${shorten(title || url.hostname, 180)}*`,
        description ? shorten(description, 600) : '_No description was provided by this page._',
        '',
        `🌐 Site: *${shorten(site || url.hostname, 100)}*`,
        `🔗 ${url.toString()}`,
    ];
    const buttons = [
        ctaUrl('Open link', url.toString()),
        quickReply('Summarize', `${prefix}summarizeurl ${url.toString()}`),
        quickReply('Check link', `${prefix}linkcheck ${url.toString()}`),
    ];
    let header = { title: 'SUKUNA MD · LINK PREVIEW', hasMediaAttachment: false };
    if (image && sock.waUploadToServer) {
        try {
            const media = await generateWAMessageContent({ image }, { upload: sock.waUploadToServer });
            if (media?.imageMessage) header = { title: 'SUKUNA MD · LINK PREVIEW', hasMediaAttachment: true, imageMessage: media.imageMessage };
        } catch (error) {
            console.error('[linkpreview image]', error.message);
        }
    }
    try {
        const wrapped = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: lines.join('\n') },
                        footer: { text: 'SUKUNA MD · public metadata preview' },
                        header,
                        nativeFlowMessage: { buttons, messageParamsJson: '' },
                    }),
                },
            },
        }, { userJid: sock.user?.id, quoted: msg });
        await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
        return wrapped;
    } catch (error) {
        console.error('[linkpreview card]', error.message);
        if (image) return sock.sendMessage(from, { image, caption: lines.join('\n') }, { quoted: msg });
        return sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg });
    }
}

module.exports = {
    name: 'linkpreview',
    aliases: ['urlpreview', 'previewlink'],
    description: 'Show a rich public webpage preview with action buttons',
    usage: '.linkpreview <public URL>',
    category: 'utility',
    async execute({ sock, msg, from, args, reply, prefix = '.' }) {
        const url = findUrl(args?.join(' '));
        if (!url) return reply(`🔗 *Link preview*\n\nUsage: ${prefix}linkpreview <public URL>\n\nThe page must be publicly reachable over HTTP or HTTPS.`);
        try {
            const response = await axios.get(url.toString(), {
                timeout: 15000,
                maxContentLength: MAX_HTML,
                responseType: 'text',
                headers: { 'User-Agent': 'SUKUNA-MD-LinkPreview/1.0' },
                validateStatus: status => status >= 200 && status < 400,
            });
            const source = String(response.data || '');
            const title = metaContent(source, ['og:title', 'twitter:title']) || htmlTitle(source) || url.hostname;
            const description = metaContent(source, ['og:description', 'twitter:description', 'description']);
            const site = metaContent(source, ['og:site_name', 'twitter:site']) || url.hostname;
            const imageUrl = findUrl(metaContent(source, ['og:image', 'twitter:image']));
            let image = null;
            if (imageUrl) {
                try {
                    const imageResponse = await axios.get(imageUrl.toString(), {
                        timeout: 10000,
                        responseType: 'arraybuffer',
                        maxContentLength: MAX_IMAGE,
                        validateStatus: status => status >= 200 && status < 400,
                    });
                    const contentType = String(imageResponse.headers['content-type'] || '');
                    if (contentType.startsWith('image/')) image = Buffer.from(imageResponse.data);
                } catch (_) {}
            }
            return sendCard({ sock, msg, from, prefix, url, title, description, site, image });
        } catch (error) {
            return reply(`❌ Could not preview that URL.\n\n${shorten(error.message, 260)}`);
        }
    },
    findUrl,
    metaContent,
};

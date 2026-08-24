'use strict';

const net = require('net');

function isPrivateHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0') return true;
    const version = net.isIP(host);
    if (version === 4) {
        const parts = host.split('.').map(Number);
        return parts[0] === 10
            || parts[0] === 127
            || (parts[0] === 169 && parts[1] === 254)
            || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
            || (parts[0] === 192 && parts[1] === 168);
    }
    if (version === 6) {
        return host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
    }
    return false;
}

function prefixOf(prefix) {
    return typeof prefix === 'string' && prefix.length ? prefix : '.';
}

function truncate(value, max = 600) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeHttpUrl(value) {
    if (!value) return null;
    let input = String(value).trim();
    if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
    try {
        const url = new URL(input);
        if (!url.hostname || !url.hostname.includes('.') || isPrivateHost(url.hostname)) return null;
        return url;
    } catch (_) {
        return null;
    }
}

function quotedMessage(msg) {
    return msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}

function unwrapMessage(message) {
    let current = message;
    for (let i = 0; i < 6 && current; i += 1) {
        const wrapper = current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.viewOnceMessageV2Extension?.message
            || current.ephemeralMessage?.message;
        if (!wrapper) break;
        current = wrapper;
    }
    return current || message;
}

function textFromMessage(message) {
    const current = unwrapMessage(message);
    return current?.conversation
        || current?.extendedTextMessage?.text
        || current?.imageMessage?.caption
        || current?.videoMessage?.caption
        || current?.documentMessage?.caption
        || '';
}

function getFirstUrl(text) {
    const match = String(text || '').match(/https?:\/\/[^\s<>]+/i);
    return match ? match[0].replace(/[),.;!?]+$/, '') : null;
}

module.exports = {
    prefixOf,
    truncate,
    normalizeHttpUrl,
    quotedMessage,
    unwrapMessage,
    textFromMessage,
    getFirstUrl,
    isPrivateHost,
};

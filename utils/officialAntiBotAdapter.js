'use strict';

const {
    normalizeMessageContent,
    getContentType,
    isJidBot,
} = require('@pasqua-baileys/baileys');
const { matchedStamp } = require('./botIdStamp');

const BOT_CONTENT_TYPES = new Set([
    'botInvokeMessage',
    'botMessage',
    'botMetadata',
]);

const MAX_MARKER_DEPTH = 8;

function hasBotMarker(value, depth = 0, seen = new Set()) {
    if (!value || typeof value !== 'object' || depth > MAX_MARKER_DEPTH || seen.has(value)) return false;
    seen.add(value);

    if (value.isBot === true || value.isBotUser === true || value.bot === true || value.isAutomated === true) return true;
    if (value.isBaileys === true || value.baileys === true) return true;
    if (typeof value.framework === 'string' && /baileys/i.test(value.framework)) return true;
    if (typeof value.library === 'string' && /baileys/i.test(value.library)) return true;
    if (typeof value.source === 'string' && /baileys/i.test(value.source)) return true;

    for (const [key, child] of Object.entries(value)) {
        if (BOT_CONTENT_TYPES.has(key) && child) return true;
        if (child && typeof child === 'object' && hasBotMarker(child, depth + 1, seen)) return true;
    }
    return false;
}

function hasKnownBotContent(value, depth = 0, seen = new Set()) {
    if (!value || typeof value !== 'object' || depth > MAX_MARKER_DEPTH || seen.has(value)) return false;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
        if (BOT_CONTENT_TYPES.has(key) && child) return true;
        if (child && typeof child === 'object' && hasKnownBotContent(child, depth + 1, seen)) return true;
    }
    return false;
}

function forwardingEvidence(value, depth = 0, seen = new Set()) {
    if (!value || typeof value !== 'object' || depth > MAX_MARKER_DEPTH || seen.has(value)) return null;
    seen.add(value);
    const score = Number(value.forwardingScore || 0);
    if (value.isForwarded === true || score > 0 || value.forwardedNewsletterMessageInfo) {
        return { isForwarded: true, forwardingScore: Number.isFinite(score) ? score : 0 };
    }
    for (const child of Object.values(value)) {
        const result = child && typeof child === 'object'
            ? forwardingEvidence(child, depth + 1, seen)
            : null;
        if (result) return result;
    }
    return null;
}

function isForwardedMessage(message = {}) {
    return Boolean(forwardingEvidence(message?.message || message));
}

function commandText(value, depth = 0, seen = new Set()) {
    if (!value || depth > MAX_MARKER_DEPTH || seen.has(value)) return '';
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return '';
    seen.add(value);
    for (const key of ['conversation', 'text']) {
        if (typeof value[key] === 'string') return value[key];
    }
    for (const child of Object.values(value)) {
        const text = commandText(child, depth + 1, seen);
        if (text) return text;
    }
    return '';
}

function hasForwardedBotResponse(value, depth = 0, seen = new Set()) {
    if (!value || typeof value !== 'object' || depth > MAX_MARKER_DEPTH || seen.has(value)) return false;
    seen.add(value);
    const forwardingScore = Number(value.forwardingScore || 0);
    const forwardedNewsletter = value.forwardedNewsletterMessageInfo;
    const quotedText = commandText(value.quotedMessage);
    if (value.isForwarded === true
        && forwardingScore >= 999
        && forwardedNewsletter
        && /^\s*[.!/#]\w+\b/i.test(quotedText)) {
        return true;
    }
    return Object.values(value).some(child =>
        child && typeof child === 'object' && hasForwardedBotResponse(child, depth + 1, seen)
    );
}

function hasBotStyleCommandResponse(value, depth = 0, seen = new Set()) {
    if (!value || typeof value !== 'object' || depth > MAX_MARKER_DEPTH || seen.has(value)) return false;
    seen.add(value);
    const context = value.contextInfo || value.messageContextInfo || {};
    const quotedText = commandText(context.quotedMessage);
    const responseText = typeof value.text === 'string'
        ? value.text
        : typeof value.conversation === 'string' ? value.conversation : '';
    const botBrand = /\b[A-Za-z][A-Za-z0-9_-]{2,}[ _-](?:bot|md)\b/i.test(responseText);
    const latency = /\b(?:speed|fast|latency|response)\s*[:=]?[\s\-]*\d+(?:\.\d+)?\s*ms\b|\b\d+(?:\.\d+)?\s*ms\b/i.test(responseText);
    const botStyleText = botBrand || latency;
    if (/^\s*[.!/#]\w+\b/i.test(quotedText) && botStyleText) return true;
    return Object.values(value).some(child =>
        child && typeof child === 'object' && hasBotStyleCommandResponse(child, depth + 1, seen)
    );
}

function normalizeForAntiBot(message = {}) {
    const rawContent = message?.message && typeof message.message === 'object'
        ? message.message
        : {};
    const content = normalizeMessageContent(rawContent) || rawContent;
    const contentType = getContentType(content) || '';
    const sender = message?.key?.participant || message?.participant || message?.key?.remoteJid || '';
    const messageId = message?.key?.id || message?.id || '';
    const stamp = matchedStamp(messageId);
    const context = content.messageContextInfo || content.contextInfo || {};
    const officialBotJid = isJidBot(sender);
    const forwarding = forwardingEvidence(rawContent) || forwardingEvidence(content) || { isForwarded: false, forwardingScore: 0 };
    const forwardedBotResponse = hasForwardedBotResponse(rawContent) || hasForwardedBotResponse(content);
    const botStyleCommandResponse = hasBotStyleCommandResponse(rawContent) || hasBotStyleCommandResponse(content);
    const botResponse = forwardedBotResponse || (forwarding.isForwarded && botStyleCommandResponse);
    const knownBotContent = BOT_CONTENT_TYPES.has(contentType)
        || hasKnownBotContent(rawContent)
        || hasKnownBotContent(content)
        || Boolean(context.bot || context.isBot || context.isBaileys)
        || hasBotMarker(message)
        || hasBotMarker(rawContent)
        || hasBotMarker(content);

    return {
        content,
        contentType,
        sender,
        messageId,
        isBot: officialBotJid || knownBotContent || botResponse || botStyleCommandResponse || Boolean(stamp),
        isBaileys: officialBotJid || knownBotContent || Boolean(stamp),
        isForwarded: forwarding.isForwarded,
        forwardingScore: forwarding.forwardingScore,
        forwardedBotResponse: botResponse,
        botStyleCommandResponse,
        source: 'pasqua-baileys',
    };
}

module.exports = { normalizeForAntiBot, forwardingEvidence, isForwardedMessage };

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
        isBot: officialBotJid || knownBotContent || Boolean(stamp),
        isBaileys: officialBotJid || knownBotContent || Boolean(stamp),
        source: 'pasqua-baileys',
    };
}

module.exports = { normalizeForAntiBot };

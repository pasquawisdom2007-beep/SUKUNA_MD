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
    const officialBotContent = BOT_CONTENT_TYPES.has(contentType)
        || Boolean(content.botInvokeMessage || content.botMessage || content.botMetadata)
        || Boolean(context.bot || context.isBot || context.isBaileys);

    return {
        content,
        contentType,
        sender,
        messageId,
        isBot: officialBotJid || officialBotContent || Boolean(stamp),
        isBaileys: officialBotJid || Boolean(stamp),
        source: 'pasqua-baileys',
    };
}

module.exports = { normalizeForAntiBot };

'use strict';

const { matchedStamp } = require('./botIdStamp');
const { normalizeForAntiBot } = require('./officialAntiBotAdapter');

function rawJid(value) {
    return value == null ? '' : String(value).trim();
}

function numberPart(jid) {
    return rawJid(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function isMultiDeviceJid(jid) {
    const match = rawJid(jid).match(/^\d+:(\d+)@s\.whatsapp\.net$/i);
    return Boolean(match && Number(match[1]) > 0);
}

function participantIdentifiers(participant) {
    if (!participant || typeof participant !== 'object') return [];
    return [participant.id, participant.jid, participant.phoneNumber, participant.lid]
        .map(rawJid)
        .filter(Boolean);
}

function sameIdentity(left, right) {
    const a = rawJid(left);
    const b = rawJid(right);
    if (!a || !b) return false;
    if (a === b) return true;
    const an = numberPart(a);
    const bn = numberPart(b);
    return Boolean(an && bn && an === bn);
}

function findParticipant(meta, jid) {
    return meta?.participants?.find(participant =>
        participantIdentifiers(participant).some(candidate => sameIdentity(candidate, jid))
    ) || null;
}

// Generic behavioral signals are deliberately bounded and weak. They can
// identify bot-like behavior without knowing a framework, but they never
// produce an immediate kick on their own.
const MAX_TRACKED_GROUPS = 5000;
const MAX_TRACKED_SENDERS = 20000;
const lastPrefixHitAt = new Map();
const burstTracker = new Map();

function looksLikeCommand(text) {
    return typeof text === 'string' && /^[.!/#]\w/.test(text.trim());
}

function noteGroupActivity(groupId, text, atMs = Date.now()) {
    if (!groupId || !looksLikeCommand(text)) return;
    if (lastPrefixHitAt.size >= MAX_TRACKED_GROUPS && !lastPrefixHitAt.has(groupId)) {
        const oldestKey = lastPrefixHitAt.keys().next().value;
        if (oldestKey !== undefined) lastPrefixHitAt.delete(oldestKey);
    }
    lastPrefixHitAt.set(groupId, atMs);
}

function rapidResponseSignal(groupId, atMs = Date.now()) {
    const last = lastPrefixHitAt.get(groupId);
    if (!last) return false;
    const delta = atMs - last;
    return delta >= 0 && delta < 900;
}

function burstSignal(groupId, jid, atMs = Date.now()) {
    if (!groupId || !jid) return false;
    const key = `${groupId}:${rawJid(jid)}`;
    let entry = burstTracker.get(key);
    if (!entry || atMs - entry.windowStart > 8000) {
        entry = { count: 0, windowStart: atMs };
    }
    entry.count += 1;
    if (burstTracker.size >= MAX_TRACKED_SENDERS && !burstTracker.has(key)) {
        const oldestKey = burstTracker.keys().next().value;
        if (oldestKey !== undefined) burstTracker.delete(oldestKey);
    }
    burstTracker.set(key, entry);
    return entry.count >= 5;
}

function hasExplicitBotFlag(participant) {
    if (!participant || typeof participant !== 'object') return false;
    return participant.isBot === true
        || participant.isBotUser === true
        || participant.bot === true
        || participant.isAutomated === true
        || participant.automation === true;
}

function hasMessageBotFlag(message) {
    if (!message || typeof message !== 'object') return false;
    const content = message.message || {};
    const context = content.messageContextInfo || content.contextInfo || {};
    return message.isBot === true
        || message.isBaileys === true
        || message.isAutomated === true
        || content.isBot === true
        || content.isBaileys === true
        || content.bot === true
        || Boolean(content.botInvokeMessage || content.botMessage || content.botMetadata)
        || Boolean(context.isBot || context.isBaileys || context.bot);
}

function deriveBotFlags(message = {}, extraStamps = []) {
    const official = normalizeForAntiBot(message);
    const content = official.content || message?.message || {};
    const context = content.messageContextInfo || content.contextInfo || {};
    const messageId = official.messageId || message?.key?.id || message?.id || '';
    const stamp = matchedStamp(messageId, extraStamps) || official.stamp || null;
    const explicitBot = official.isBot === true
        || message.isBot === true
        || message.isAutomated === true
        || content.isBot === true
        || content.isAutomated === true
        || content.bot === true
        || Boolean(content.botInvokeMessage || content.botMessage || content.botMetadata)
        || Boolean(context.isBot || context.bot);
    const explicitBaileys = official.isBaileys === true
        || message.isBaileys === true
        || content.isBaileys === true
        || context.isBaileys === true;
    return {
        isBot: explicitBot || explicitBaileys || Boolean(stamp),
        isBaileys: explicitBaileys || Boolean(stamp),
        stamp,
    };
}

function annotateBotFlags(message, extraStamps = []) {
    if (!message || typeof message !== 'object') return message;
    const flags = deriveBotFlags(message, extraStamps);
    message.isBot = flags.isBot;
    message.isBaileys = flags.isBaileys;
    return message;
}

function detectBotSignals({ jid, participant, messageId, message, groupId, extraStamps = [], atMs = Date.now() } = {}) {
    const signals = [];
    const flags = deriveBotFlags(message, extraStamps);
    const stamp = flags.stamp || matchedStamp(messageId, extraStamps);
    if (stamp) signals.push({ type: 'message-id-stamp', value: stamp, confidence: 'high' });
    if (hasExplicitBotFlag(participant)) signals.push({ type: 'explicit-bot-flag', confidence: 'high' });
    if (hasMessageBotFlag(message)) signals.push({ type: 'explicit-message-bot-flag', confidence: 'high' });
    if (isMultiDeviceJid(jid)) signals.push({ type: 'linked-device-jid', confidence: 'weak' });
    if (groupId && rapidResponseSignal(groupId, atMs)) {
        signals.push({ type: 'instant-command-reply', confidence: 'weak' });
    }
    if (groupId && burstSignal(groupId, jid, atMs)) {
        signals.push({ type: 'message-burst', confidence: 'weak' });
    }
    const highConfidence = signals.some(signal => signal.confidence === 'high');
    const weakCount = signals.filter(signal => signal.confidence === 'weak').length;
    return {
        signals,
        highConfidence,
        mediumConfidence: !highConfidence && weakCount >= 2,
        candidate: signals.length > 0,
        reason: signals.map(signal => signal.type === 'message-id-stamp'
            ? `${signal.type} (${signal.value})`
            : signal.type).join(', '),
    };
}

function shortJid(jid) {
    return numberPart(jid) || rawJid(jid).split('@')[0] || 'member';
}

module.exports = {
    rawJid,
    numberPart,
    isMultiDeviceJid,
    participantIdentifiers,
    sameIdentity,
    findParticipant,
    hasExplicitBotFlag,
    hasMessageBotFlag,
    deriveBotFlags,
    annotateBotFlags,
    detectBotSignals,
    shortJid,
    noteGroupActivity,
    looksLikeCommand,
};

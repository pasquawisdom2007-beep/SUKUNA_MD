'use strict';

const { matchedStamp } = require('./botIdStamp');

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

function hasExplicitBotFlag(participant) {
    if (!participant || typeof participant !== 'object') return false;
    return participant.isBot === true
        || participant.isBotUser === true
        || participant.bot === true
        || participant.isAutomated === true
        || participant.automation === true;
}

function detectBotSignals({ jid, participant, messageId } = {}) {
    const signals = [];
    const stamp = matchedStamp(messageId);
    if (stamp) signals.push({ type: 'message-id-stamp', value: stamp, confidence: 'high' });
    if (hasExplicitBotFlag(participant)) signals.push({ type: 'explicit-bot-flag', confidence: 'high' });
    if (isMultiDeviceJid(jid)) signals.push({ type: 'linked-device-jid', confidence: 'weak' });

    return {
        signals,
        highConfidence: signals.some(signal => signal.confidence === 'high'),
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
    detectBotSignals,
    shortJid,
};

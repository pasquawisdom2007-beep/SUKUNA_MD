'use strict';

const { normalizeForAntiBot } = require('./officialAntiBotAdapter');
const { detectBotSignals } = require('./antiBotSignals');

/**
 * Public, framework-neutral detector API.
 *
 * This is evidence-based rather than a universal bot oracle: a JID by itself
 * cannot prove that a sender is Baileys, and linked human devices can expose
 * device-style JIDs. High-confidence results require explicit protocol or
 * framework evidence. Behavioral and device-shape signals remain advisory.
 */
function analyzeMessage({ message = {}, participant = null, groupId = '', extraStamps = [], atMs } = {}) {
    const official = normalizeForAntiBot(message);
    const detection = detectBotSignals({
        jid: official.sender,
        participant,
        messageId: official.messageId,
        message,
        groupId,
        extraStamps,
        atMs,
    });
    const confidence = detection.highConfidence
        ? 'high'
        : detection.mediumConfidence
            ? 'medium'
            : detection.candidate
                ? 'low'
                : 'none';
    return {
        isLikelyBot: confidence === 'high' || confidence === 'medium',
        confidence,
        sender: official.sender || '',
        contentType: official.contentType || '',
        source: official.source || 'local-signals',
        signals: detection.signals,
        reason: detection.reason || 'No bot evidence detected.',
        limitations: 'JID and linked-device shape are advisory only; no detector can guarantee identification of every bot or library.',
    };
}

function detectorInfo() {
    return {
        name: 'Sukuna Layered AntiBot Detector',
        version: 1,
        signals: [
            'explicit protocol bot metadata',
            'official bot JID classification when available',
            'known message-ID framework stamps',
            'linked-device JID shape as weak evidence',
            'instant command replies as weak evidence',
            'message bursts as weak evidence',
        ],
        policy: 'High-confidence evidence may be enforced by group policy; heuristic evidence is warning-only.',
    };
}

module.exports = {
    analyzeMessage,
    detectorInfo,
};

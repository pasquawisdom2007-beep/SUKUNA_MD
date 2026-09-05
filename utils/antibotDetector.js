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

function attachLiveListener(sock, { onMessage, onFlag, getExtraStamps } = {}) {
    if (!sock?.ev?.on) throw new TypeError('A Baileys socket with ev.on is required');
    if (sock.__sukunaLayeredDetectorListener) return sock.__sukunaLayeredDetectorListener;

    const seen = new Set();
    const seenQueue = [];
    const remember = key => {
        if (!key || seen.has(key)) return false;
        seen.add(key);
        seenQueue.push(key);
        if (seenQueue.length > 10000) seen.delete(seenQueue.shift());
        return true;
    };
    const listener = async batch => {
        for (const message of batch?.messages || []) {
            const groupId = message?.key?.remoteJid || '';
            if (!groupId.endsWith('@g.us') || message?.key?.fromMe) continue;
            const messageId = message?.key?.id || `${groupId}:${message?.messageTimestamp || Date.now()}`;
            if (!remember(messageId)) continue;
            const extraStamps = typeof getExtraStamps === 'function' ? getExtraStamps() : [];
            const analysis = analyzeMessage({ message, groupId, extraStamps });
            try {
                if (typeof onMessage === 'function') await onMessage(message, analysis);
                if ((analysis.confidence === 'high' || analysis.confidence === 'medium') && typeof onFlag === 'function') {
                    await onFlag(message, analysis);
                }
            } catch (error) {
                console.error('[ANTIBOT LISTENER]', error.message);
            }
        }
    };

    sock.ev.on('messages.upsert', listener);
    const handle = {
        listener,
        detach() {
            if (typeof sock.ev.off === 'function') sock.ev.off('messages.upsert', listener);
            else if (typeof sock.ev.removeListener === 'function') sock.ev.removeListener('messages.upsert', listener);
            if (sock.__sukunaLayeredDetectorListener === handle) delete sock.__sukunaLayeredDetectorListener;
        },
    };
    sock.__sukunaLayeredDetectorListener = handle;
    return handle;
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
        knownLibraries: [
            '@whiskeysockets/baileys',
            '@pasqua-baileys/baileys',
            'baileys',
            '@adiwajshing/baileys',
            '@itsliaaa/baileys',
            '@hbmodsofc/baileys',
            'rfc-baileys',
        ],
        registryNote: 'This is a package registry for adapter coverage, not proof that an inbound JID came from a specific npm package.',
        policy: 'High-confidence evidence may be enforced by group policy; heuristic evidence is warning-only.',
    };
}

module.exports = {
    analyzeMessage,
    attachLiveListener,
    detectorInfo,
};

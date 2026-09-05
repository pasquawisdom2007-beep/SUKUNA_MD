'use strict';

const { analyzeMessage, detectorInfo } = require('../../utils/antibotDetector');
const database = require('../../utils/database');

function unwrapQuoted(msg) {
    const context = msg?.message?.extendedTextMessage?.contextInfo
        || msg?.message?.imageMessage?.contextInfo
        || msg?.message?.videoMessage?.contextInfo
        || msg?.message?.documentMessage?.contextInfo
        || msg?.message?.audioMessage?.contextInfo
        || {};
    const quoted = context.quotedMessage;
    if (!quoted) return null;
    return {
        key: {
            id: context.stanzaId || '',
            participant: context.participant || context.remoteJid || '',
            remoteJid: context.remoteJid || msg?.key?.remoteJid || '',
            fromMe: false,
        },
        message: quoted,
        participant: context.participant || context.remoteJid || '',
    };
}

function signalLine(signal) {
    const value = signal.value ? ` (${signal.value})` : '';
    return `• ${signal.type}${value} [${signal.confidence}]`;
}

module.exports = {
    name: 'device',
    aliases: ['devicecheck', 'botdevice', 'detectbot'],
    description: 'Inspect a replied-to message for layered bot/device evidence',
    usage: '.device (reply to a message)',
    category: 'admin',
    async execute({ sock, msg, from, reply, isAdmin, isOwner }) {
        if (!isAdmin && !isOwner) return reply('🛡️ *Admin only.* Reply to a message and run `.device` to inspect it.');
        const target = unwrapQuoted(msg);
        if (!target) {
            return reply('📱 *Device diagnostics*\n\nReply to a message from the account you want to inspect, then run `.device`.\n\nThis tool reports evidence and confidence; a JID alone cannot prove that every sender is a bot.');
        }

        let participant = null;
        if (from?.endsWith('@g.us')) {
            const meta = await sock.groupMetadata(from).catch(() => null);
            participant = meta?.participants?.find(p =>
                [p?.id, p?.jid, p?.phoneNumber, p?.lid].filter(Boolean).some(id =>
                    String(id).split(':')[0] === String(target.participant).split(':')[0]
                )
            ) || null;
        }

        const result = analyzeMessage({
            message: target,
            participant,
            groupId: from,
            extraStamps: database.getCustomBotStamps(),
        });
        const info = detectorInfo();
        const sender = result.sender || 'unknown';
        const signals = result.signals.length
            ? result.signals.map(signalLine).join('\n')
            : '• none';
        const verdict = result.confidence === 'high'
            ? 'HIGH-CONFIDENCE BOT EVIDENCE'
            : result.confidence === 'medium'
                ? 'MEDIUM-CONFIDENCE BOT-LIKE BEHAVIOR'
                : result.confidence === 'low'
                    ? 'LOW-CONFIDENCE DEVICE/BEHAVIOR HINT'
                    : 'NO BOT EVIDENCE DETECTED';

        return reply(
            `📱 *DEVICE / ANTIBOT DIAGNOSTICS*\n\n` +
            `Sender: *${sender}*\n` +
            `Verdict: *${verdict}*\n` +
            `Confidence: *${result.confidence.toUpperCase()}*\n` +
            `Content type: *${result.contentType || 'unknown'}*\n` +
            `Adapter: *${result.source}*\n\n` +
            `*Signals*\n${signals}\n\n` +
            `*Reason:* ${result.reason}\n\n` +
            `*Detector:* ${info.name} v${info.version}\n` +
            `_JID shape and linked-device hints are advisory. Heuristic matches are warning-only._`
        );
    },
};

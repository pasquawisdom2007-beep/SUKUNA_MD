'use strict';

const config = require('../../config');
const { generateWAMessageFromContent, proto } = require('@pasqua-dev/baileys');

const PHRASES = [
    'UNTOUCHABLE.',
    'RYŌIKI TENKAI.',
    'CURSED ENERGY ONLINE.',
    'DOMAIN EXPANDED.',
    'NO LAG. JUST FEAR.',
    'THE CORE IS AWAKE.',
    'PULSE LOCKED.',
    'CLEAN. COLD. CONNECTED.',
    'THE NETWORK KNEELS.',
    'ABSOLUTE RESPONSE.',
    'CURSED CORE RESPONDING.',
];

const BOLD_DIGITS = Array.from('𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗');

function toBoldDigits(value) {
    return String(value).replace(/\d/g, digit => BOLD_DIGITS[Number(digit)]);
}

function pickPhrase() {
    return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

function clockFor(timeZone) {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(new Date());
    } catch (_) {
        return new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(new Date());
    }
}

function sendNativePingCard({ sock, jid, msg, title, body }) {
    const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
        body: { text: body },
        header: {
            title,
            hasMediaAttachment: false,
        },
        nativeFlowMessage: {
            // Same native viewer-specific surface as .alive, with a separate
            // ping design and latency payload.
            buttons: [{
                name: 'inapp_signup',
                buttonParamsJson: '{}',
            }],
            messageParamsJson: '{}',
        },
    });

    const wrapped = generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadataVersion: 2,
                        deviceListMetadata: {},
                    },
                    interactiveMessage,
                },
            },
        },
        {
            userJid: sock.user?.id,
            quoted: msg,
        }
    );

    return sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
}

module.exports = {
    name: 'ping',
    aliases: ['speed', 'latency'],
    description: 'Check bot response speed with a native latency card',
    usage: '.ping',
    category: 'admin',

    async execute({ sock, msg, from, reply }) {
        const started = process.hrtime.bigint();
        try {
            // Measure a real socket operation without sending a disposable
            // placeholder that has to be edited afterward.
            await sock.sendPresenceUpdate('available', from).catch(() => {});
            const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
            const ms = Math.max(1, Math.ceil(elapsedMs));
            const timeZone = process.env.BOT_TIMEZONE || 'Africa/Lagos';
            const title = `⚡ ${config.botName || 'SUKUNA MD'} PULSEㅤㅤ${clockFor(timeZone)}`;
            const body = `\`\`\`◈ ${toBoldDigits(ms)}𝐦𝐬 — ${pickPhrase()}\`\`\`\n\`『PING / ${timeZone}』\``;
            await sendNativePingCard({ sock, jid: from, msg, title, body });
        } catch (error) {
            console.error('[Ping Native Card]', error.message);
            const ms = Math.max(1, Math.ceil(Number(process.hrtime.bigint() - started) / 1e6));
            await reply(`⚡ ${toBoldDigits(ms)}𝐦𝐬 | ${pickPhrase()}`);
        }
    },
};

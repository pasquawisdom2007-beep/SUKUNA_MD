'use strict';

const crypto = require('crypto');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
}

function richContext(quoted) {
    if (!quoted?.key) return {
        forwardingScore: 1,
        isForwarded: true,
        forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
        forwardOrigin: 4,
    };
    return {
        forwardingScore: 1,
        isForwarded: true,
        forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
        forwardOrigin: 4,
        stanzaId: quoted.key.id,
        participant: quoted.key.participant || quoted.participant || quoted.key.remoteJid,
        ...(quoted.message ? { quotedMessage: quoted.message } : {}),
    };
}

function buildRichContent(html, quoted) {
    const data = Buffer.from(JSON.stringify({
        __typename: 'GenAIUnifiedResponse',
        response_id: crypto.randomUUID(),
        sections: [{
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
                    trusted_sources: [],
                    payload: String(html),
                },
            },
        }],
    })).toString('base64');

    return proto.Message.fromObject({
        messageContextInfo: {
            threadId: [],
            deviceListMetadata: {
                senderKeyIndexes: [],
                recipientKeyIndexes: [],
                recipientKeyHash: '',
                recipientTimestamp: Math.floor(Date.now() / 1000),
            },
            deviceListMetadataVersion: 2,
            messageSecret: crypto.randomBytes(32),
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [],
                    unifiedResponse: { data },
                    contextInfo: richContext(quoted),
                },
            },
        },
    });
}

function textHtml(text, title = 'SUKUNA MD') {
    const safeTitle = escapeHtml(title);
    const safeText = escapeHtml(text);
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:radial-gradient(circle at 50% 5%,#174936,#061812 72%)}.card{padding:14px;border:2px solid #b9954d;border-radius:16px;background:linear-gradient(145deg,#0a2e22,#123e2f 55%,#061812);color:#e3dfbb;box-shadow:inset 0 0 0 3px #163f31,0 7px 18px #000b}.title{text-align:center;color:#f1e3a2;font:bold 17px Arial Black,sans-serif;letter-spacing:.7px}.rule{height:2px;margin:9px 0;background:linear-gradient(90deg,transparent,#b9954d,transparent)}.body{white-space:pre-wrap;overflow-wrap:anywhere;color:#e8f4e5;font:13px/1.45 monospace}.footer{margin-top:11px;text-align:center;color:#8fbea0;font:10px monospace}</style></head><body><div class="card"><div class="title">${safeTitle}</div><div class="rule"></div><div class="body">${safeText}</div><div class="footer">SUKUNA MD · GENAI RICH RESPONSE</div></div></body></html>`;
}

async function sendRichHtml({ sock, jid, quoted, html }) {
    const content = buildRichContent(html, quoted);
    const safeQuoted = quoted?.message ? quoted : undefined;
    const wrapped = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted: safeQuoted });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

async function sendRichText({ sock, jid, quoted, text, title }) {
    return sendRichHtml({ sock, jid, quoted, html: textHtml(text, title) });
}

function createEconomyGenAISock(sock, { title = 'ECONOMY' } = {}) {
    return new Proxy(sock, {
        get(target, property) {
            if (property !== 'sendMessage') {
                const value = target[property];
                return typeof value === 'function' ? value.bind(target) : value;
            }
            return async (jid, content, options = {}) => {
                const isEditable = Boolean(content?.edit);
                const isReaction = Boolean(content?.react);
                const shouldRichRender = !isEditable && !isReaction &&
                    (Boolean(content?.image) || typeof content?.text === 'string');
                if (!shouldRichRender) return target.sendMessage.call(target, jid, content, options);
                const text = content.text || content.caption || 'Economy update';
                return sendRichText({ sock: target, jid, quoted: options.quoted, text, title });
            };
        },
    });
}

module.exports = { escapeHtml, buildRichContent, sendRichHtml, sendRichText, createEconomyGenAISock };

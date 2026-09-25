'use strict';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const sessions = new Map();
const BLOCKED = /\b(?:process|require|module|exports|__dirname|__filename|child_process|spawn|exec|fork|rmSync|unlinkSync)\b/;
const MAX_SOURCE = 12_000;
const TIMEOUT_MS = 15_000;

function sessionKey(phoneNumber, sender) {
    return `${String(phoneNumber || 'session')}:${String(sender || 'developer')}`;
}

function inspect(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, (_key, item) => Buffer.isBuffer(item) ? `[Buffer ${item.length} bytes]` : item, 2);
    } catch (_) {
        return String(value);
    }
}

function normalizeCode(input) {
    return String(input || '').trim().replace(/^\$\s*/, '').trim();
}

async function runDeveloperCode({ code, mode = 'eval', sock, msg, m, from, sender, phoneNumber, reply, database }) {
    const source = normalizeCode(code);
    if (!source) return { ok: false, error: 'No JavaScript code supplied.' };
    if (source.length > MAX_SOURCE) return { ok: false, error: `Code is limited to ${MAX_SOURCE} characters.` };
    if (BLOCKED.test(source)) return { ok: false, error: 'That runtime or module access is blocked in developer chat execution.' };

    const key = sessionKey(phoneNumber, sender);
    const state = sessions.get(key) || Object.create(null);
    sessions.set(key, state);
    const jid = from;
    let devSock;
    const sendRichHtmlMessage = async (target, payload) => {
        const { sendRichHtmlMessage: send } = require('./genaiRich');
        return send({ sock: devSock, jid: target || jid, quoted: msg, ...payload });
    };
    const sendMiniApp = async (target, payload = {}) => {
        if (typeof sock.sendMiniApp === 'function') return sock.sendMiniApp(target || jid, payload);
        return sendRichHtmlMessage(target || jid, {
            title: payload.title || 'SUKUNA MD Mini App',
            html: payload.html || `<h1>${String(payload.title || 'Mini App')}</h1>`,
            url: payload.url || '',
            trustedSources: payload.trustedSources || [],
        });
    };
    devSock = new Proxy(sock, {
        get(target, property, receiver) {
            if (property === 'sendRichHtmlMessage') return sendRichHtmlMessage;
            if (property === 'sendMiniApp') return sendMiniApp;
            const value = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });

    const scope = {
        sock: devSock,
        msg,
        m,
        jid,
        from,
        sender,
        reply,
        database,
        console,
        sendRichHtmlMessage,
        sendMiniApp,
        ...state,
    };
    let runnable = source;
    if (mode === 'const') {
        const match = source.match(/^(?:const\s+)?([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+?);?$/);
        if (!match) return { ok: false, error: 'Use `.const name = expression`.' };
        runnable = `return (${match[2]});`;
    } else if (!/^(?:const|let|var|if|for|while|return|throw|try|class|function)\b/.test(source) && !/[;{}]\s*$/.test(source)) {
        // Developer shorthand is expression-oriented: `1 + 2`,
        // `sock.sendMessage(...)`, and `await sock...` should return a value.
        runnable = `return (${source});`;
    }

    const reserved = Object.keys(scope);
    const values = reserved.map(name => scope[name]);
    let result;
    try {
        const fn = new AsyncFunction(...reserved, `'use strict';\n${runnable}`);
        let timeout;
        try {
            result = await Promise.race([
                fn(...values),
                new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Developer code timed out.')), TIMEOUT_MS); }),
            ]);
        } finally {
            clearTimeout(timeout);
        }
        if (mode === 'const') state[source.match(/^(?:const\s+)?([A-Za-z_$][\w$]*)/)[1]] = result;
        return { ok: true, output: inspect(result) };
    } catch (error) {
        return { ok: false, error: `${error.name || 'Error'}: ${error.message}` };
    }
}

function clearDeveloperSession(phoneNumber, sender) {
    sessions.delete(sessionKey(phoneNumber, sender));
}

module.exports = { runDeveloperCode, clearDeveloperSession, inspect };

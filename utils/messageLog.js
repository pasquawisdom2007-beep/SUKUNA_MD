/**
 * Message Log — coloured, professional console reporter for SUKUNA MD
 *
 * Prints every message the bot receives, plus delete/recovery events, as a
 * clean boxed card in the terminal:
 *
 *   ┌─ 💬 INCOMING · 14:03:22 · GROUP SUKUNA TESTERS ────────────────
 *   │ FROM     +254712345678 · Ada
 *   │ TYPE     text · 42 chars
 *   │ BODY     hello world …
 *   └────────────────────────────────────────────────────────────────
 *
 * Rules:
 *   • never throws — logging must not be able to break a session
 *   • every value is truncated so one huge message cannot flood the terminal
 *   • colours degrade gracefully when stdout is not a TTY (pipes, panels)
 */
'use strict';

let chalk = null;
try { chalk = require('chalk'); } catch (_) { chalk = null; }

const WIDTH    = 62;
const MAX_BODY = 180;

// ── Colour helpers (all failure-tolerant) ──────────────────────────
const paint = (fn, text) => {
    try {
        if (!chalk || typeof fn !== 'function') return String(text);
        return fn(String(text));
    } catch (_) {
        return String(text);
    }
};

const hex = (code) => {
    try { return chalk && chalk.hex ? chalk.hex(code) : null; } catch (_) { return null; }
};

const c = {
    violet:  (t) => paint(hex('#A78BFA'), t),
    purple:  (t) => paint(hex('#7C3AED'), t),
    cyan:    (t) => paint(chalk && chalk.cyan, t),
    green:   (t) => paint(chalk && chalk.green, t),
    yellow:  (t) => paint(chalk && chalk.yellow, t),
    red:     (t) => paint(chalk && chalk.red, t),
    magenta: (t) => paint(chalk && chalk.magenta, t),
    white:   (t) => paint(chalk && chalk.white, t),
    grey:    (t) => paint(chalk && chalk.gray, t),
    bold:    (t) => paint(chalk && chalk.bold, t),
};

// ── Formatting ────────────────────────────────────────────────────

const clock = () => {
    try {
        return new Date().toLocaleTimeString('en-GB', { hour12: false });
    } catch (_) {
        return new Date().toISOString().slice(11, 19);
    }
};

const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');

/** Collapse to a single tidy line and truncate. */
function oneLine(value, max = MAX_BODY) {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/\s*\n+\s*/g, ' ⏎ ').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

const rule = (char = '─') => char.repeat(WIDTH);

function top(title, accent) {
    const head = `┌─ ${title} `;
    const tail = rule();
    return accent(head) + c.grey(tail.slice(Math.min(tail.length, head.length + 2)));
}

function bottom() {
    return c.grey(`└${rule()}`);
}

function row(label, value, tint = c.white) {
    return `${c.violet('│')} ${c.grey(label.padEnd(9))} ${tint(value)}`;
}

function block(lines) {
    try {
        console.log(lines.filter(Boolean).join('\n'));
    } catch (_) { /* noop */ }
}

// ── Message introspection ─────────────────────────────────────────

function unwrap(message) {
    let content = message?.message || {};
    for (let i = 0; i < 6; i += 1) {
        const nested = content?.ephemeralMessage?.message
            || content?.viewOnceMessage?.message
            || content?.viewOnceMessageV2?.message
            || content?.viewOnceMessageV2Extension?.message
            || content?.documentWithCaptionMessage?.message;
        if (!nested) break;
        content = nested;
    }
    return content;
}

const TYPE_META = {
    text:     { icon: '💬', tint: c.white },
    image:    { icon: '🖼️', tint: c.cyan },
    video:    { icon: '🎬', tint: c.cyan },
    audio:    { icon: '🎙️', tint: c.cyan },
    document: { icon: '📄', tint: c.cyan },
    sticker:  { icon: '🏷️', tint: c.magenta },
    contact:  { icon: '👤', tint: c.white },
    location: { icon: '📍', tint: c.white },
    poll:     { icon: '📊', tint: c.white },
    reaction: { icon: '❤️', tint: c.magenta },
    unknown:  { icon: '❔', tint: c.grey },
};

function inspect(message) {
    const content = unwrap(message);
    const text =
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.buttonsResponseMessage?.selectedDisplayText ||
        content?.listResponseMessage?.title ||
        null;
    if (text) return { type: 'text', body: text, caption: null };

    const media = {
        imageMessage:    'image',
        videoMessage:    'video',
        audioMessage:    'audio',
        documentMessage: 'document',
        stickerMessage:  'sticker',
    };
    for (const [key, type] of Object.entries(media)) {
        if (content?.[key]) {
            return {
                type,
                body:    null,
                caption: content[key].caption || null,
                mimetype: content[key].mimetype || null,
                fileName: content[key].fileName || null,
            };
        }
    }
    if (content?.contactMessage || content?.contactsArrayMessage) return { type: 'contact', body: null, caption: null };
    if (content?.locationMessage || content?.liveLocationMessage) return { type: 'location', body: null, caption: null };
    if (content?.pollCreationMessage || content?.pollCreationMessageV3) return { type: 'poll', body: null, caption: null };
    if (content?.reactionMessage) return { type: 'reaction', body: content.reactionMessage.text || null, caption: null };
    return { type: 'unknown', body: null, caption: null };
}

// ── Public reporters ──────────────────────────────────────────────

/**
 * Log one incoming/outgoing message.
 * Accepts either the raw Baileys message or a pre-built entry.
 */
function logIncoming({ msg, isGroup, jid, groupName, entry } = {}) {
    try {
        const key    = msg?.key || {};
        const chat   = jid || key.remoteJid || 'unknown';
        const data   = entry || null;
        const info   = data
            ? { type: data.type, body: data.body, caption: data.caption, mimetype: data.mimetype, fileName: data.fileName }
            : inspect(msg);

        const meta   = TYPE_META[info.type] || TYPE_META.unknown;
        const senderNum = data?.senderNum
            || digits(key.participant || key.remoteJid);
        const name   = data?.pushName || msg?.pushName || '';
        const outgoing = data?.fromMe ?? !!key.fromMe;

        const scope = isGroup === true || String(chat).endsWith('@g.us')
            ? `GROUP ${c.bold(oneLine(groupName || chat, 32))}`
            : `DM ${c.bold(oneLine(name || chat, 32))}`;

        const direction = outgoing ? c.yellow('SENT') : c.green('RECV');
        const title = `${meta.icon} ${c.bold('MESSAGE')} ${c.grey('·')} ${c.cyan(clock())} ${c.grey('·')} ${scope} ${c.grey('·')} ${direction}`;

        const body = info.body || info.caption || '';
        const length = body ? `${body.length} chars` : (info.fileName ? oneLine(info.fileName, 40) : '—');

        block([
            top(title, c.purple),
            row('FROM', `${senderNum ? `+${senderNum}` : 'unknown'}${name ? ` · ${oneLine(name, 26)}` : ''}`),
            row('TYPE', `${info.type}${info.mimetype ? ` · ${info.mimetype.split(';')[0]}` : ''} · ${length}`, meta.tint),
            body ? row(info.body ? 'BODY' : 'CAPTION', oneLine(body), meta.tint) : '',
            row('ID', c.grey(oneLine(key.id || data?.id || 'unknown', 40))),
            bottom(),
        ]);
    } catch (_) { /* noop */ }
}

/** A delete-for-everyone event was detected. */
function logDeleted({ jid, senderNum, deleterNum, mode, chatName } = {}) {
    try {
        const route = mode === 'chat' ? 'this chat' : "owner DM";
        block([
            top(`${c.red('🗑️')} ${c.bold('ANTI-DELETE')} ${c.grey('·')} ${c.cyan(clock())} ${c.grey('·')} ${c.bold(oneLine(chatName || jid || 'chat', 30))}`, c.red),
            row('SENDER', senderNum ? `+${senderNum}` : 'unknown'),
            row('DELETED BY', deleterNum ? `+${deleterNum}` : 'unknown', c.yellow),
            row('ROUTE', route, c.magenta),
            bottom(),
        ]);
    } catch (_) { /* noop */ }
}

/** A deleted message was successfully re-delivered. */
function logRecovered({ jid, type, route, bytes } = {}) {
    try {
        block([
            top(`${c.green('♻️')} ${c.bold('RECOVERED')} ${c.grey('·')} ${c.cyan(clock())} ${c.grey('·')} ${c.bold(oneLine(jid || 'chat', 30))}`, c.green),
            row('TYPE', `${type || 'message'}${bytes ? ` · ${(bytes / 1024).toFixed(1)} KB` : ''}`, c.green),
            row('DELIVERED', route || "owner DM", c.magenta),
            bottom(),
        ]);
    } catch (_) { /* noop */ }
}

/** Generic info line (vault stats, mode changes, …). */
function logInfo(label, value) {
    try {
        console.log(`${c.violet('│')} ${c.grey(oneLine(label, 18).padEnd(18))} ${c.white(oneLine(value, 70))}`);
    } catch (_) { /* noop */ }
}

function logError(scope, error) {
    try {
        const text = error instanceof Error ? error.message : String(error);
        console.log(
            `${c.red('│')} ${c.grey(clock())} ${c.red('✖')} ${c.bold(oneLine(scope, 20))} ${c.grey('·')} ${c.red(oneLine(text, 90))}`
        );
    } catch (_) { /* noop */ }
}

module.exports = { logIncoming, logDeleted, logRecovered, logInfo, logError, oneLine };

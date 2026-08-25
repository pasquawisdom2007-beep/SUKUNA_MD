'use strict';

const { sendRoadmapButtons } = require('./roadmapButtons');

const MAX_MESSAGES_PER_GROUP = 240;
const MAX_RECAPS = 80;
const RECAP_TTL_MS = 30 * 60 * 1000;
const MAX_TRANSCRIPT_ENTRIES = 100;
const groups = new Map();
const recaps = new Map();

function unwrapMessage(message) {
    let current = message?.message || message || {};
    for (let i = 0; i < 8; i += 1) {
        const nested = current?.ephemeralMessage?.message
            || current?.viewOnceMessage?.message
            || current?.viewOnceMessageV2?.message
            || current?.documentWithCaptionMessage?.message;
        if (!nested) break;
        current = nested;
    }
    return current || {};
}

function timestampSeconds(message) {
    const raw = message?.messageTimestamp ?? message?.message?.messageTimestamp;
    if (raw && typeof raw.toNumber === 'function') return raw.toNumber();
    if (raw && typeof raw === 'object' && Number.isFinite(raw.low)) return Number(raw.low);
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric > 10_000_000_000 ? numeric / 1000 : numeric;
    return Math.floor(Date.now() / 1000);
}

function messageText(message) {
    const content = unwrapMessage(message);
    const text = content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || content.documentMessage?.caption
        || content.buttonsResponseMessage?.selectedDisplayText
        || content.templateButtonReplyMessage?.selectedDisplayText
        || content.interactiveResponseMessage?.body?.text;
    if (text && String(text).trim()) return String(text).replace(/\s+/g, ' ').trim().slice(0, 700);
    const media = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'contactMessage', 'locationMessage'];
    const found = media.find(key => content[key]);
    return found ? `[${found.replace('Message', '').toLowerCase()}]` : '';
}

function senderLabel(message) {
    const content = unwrapMessage(message);
    if (message?.key?.fromMe) return 'SUKUNA MD';
    return String(message?.pushName || content?.contextInfo?.participant || message?.key?.participant || 'Unknown')
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '')
        .slice(-8) || String(message?.pushName || 'Unknown').slice(0, 32);
}

function pruneGroup(map, now = Date.now()) {
    for (const [id, entry] of map) {
        if (now - entry.seenAt > 72 * 60 * 60 * 1000) map.delete(id);
    }
    while (map.size > MAX_MESSAGES_PER_GROUP) map.delete(map.keys().next().value);
}

function recordMessage(phoneNumber, message) {
    const jid = message?.key?.remoteJid;
    if (!phoneNumber || !jid || !jid.endsWith('@g.us') || !message?.key?.id) return;
    const text = messageText(message);
    if (!text) return;
    if (!groups.has(phoneNumber)) groups.set(phoneNumber, new Map());
    const sessionGroups = groups.get(phoneNumber);
    if (!sessionGroups.has(jid)) sessionGroups.set(jid, new Map());
    const group = sessionGroups.get(jid);
    group.set(message.key.id, {
        id: message.key.id,
        timestamp: timestampSeconds(message),
        seenAt: Date.now(),
        sender: senderLabel(message),
        text,
        fromMe: Boolean(message.key.fromMe),
    });
    pruneGroup(group);
}

function getRecentMessages(phoneNumber, jid, hours = 12, now = Date.now()) {
    const cutoff = Math.floor((now - hours * 60 * 60 * 1000) / 1000);
    return [...(groups.get(phoneNumber)?.get(jid)?.values() || [])]
        .filter(entry => entry.timestamp >= cutoff)
        .sort((a, b) => a.timestamp - b.timestamp);
}

function localTime(timestamp, timeZone = process.env.TZ || 'UTC') {
    try {
        return new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp * 1000));
    } catch (_) {
        return new Date(timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
    }
}

function clip(text, max = 520) {
    const value = String(text || '').trim();
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function extractLikelyLines(entries, pattern, emptyText) {
    const matches = entries.filter(entry => pattern.test(entry.text)).slice(-8);
    if (!matches.length) return emptyText;
    return matches.map(entry => `• ${entry.sender}: ${clip(entry.text, 240)}`).join('\n');
}

function deterministicSections(entries, hours) {
    const contributors = new Map();
    for (const entry of entries) contributors.set(entry.sender, (contributors.get(entry.sender) || 0) + 1);
    const top = [...contributors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, count]) => `${name} (${count})`).join(', ') || 'No named contributors';
    const latest = entries.slice(-8).map(entry => `• ${entry.sender}: ${clip(entry.text, 260)}`).join('\n') || 'No readable messages were captured.';
    return {
        summary: `This group recap covers the last ${hours} hour(s).\n\nMessages analyzed: ${entries.length}\nActive contributors: ${top}\n\nRecent discussion:\n${latest}`,
        decisions: extractLikelyLines(entries, /\b(decided|decision|agreed|approved|confirmed|we will|let us)\b/i, 'No clear decisions were detected in the captured messages. This is a conservative result, not proof that no decision occurred.'),
        actions: extractLikelyLines(entries, /\b(todo|action item|please|need to|needs to|should|can you|will you|remember to|follow up)\b/i, 'No clear action items were detected in the captured messages.'),
        full: entries.slice(-60).map(entry => `[${localTime(entry.timestamp)}] ${entry.sender}: ${entry.text}`).join('\n') || 'No readable messages were captured.',
    };
}

function parseAiSections(raw, fallback) {
    const text = String(raw || '').replace(/```(?:text|markdown)?/gi, '').replace(/```/g, '').trim();
    if (!text) return fallback;
    const headings = ['SUMMARY', 'DECISIONS', 'ACTION ITEMS', 'FULL RECAP'];
    const found = {};
    for (let i = 0; i < headings.length; i += 1) {
        const current = headings[i];
        const next = headings.slice(i + 1).join('|');
        const pattern = new RegExp(`(?:^|\\n)\\s*(?:#{1,4}\\s*)?${current}\\s*:?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:#{1,4}\\s*)?(?:${next})\\s*:??\\s*\\n|$)`, 'i');
        const match = text.match(pattern);
        if (match?.[1]?.trim()) found[current] = match[1].trim();
    }
    if (!Object.keys(found).length) return { ...fallback, summary: text };
    return {
        summary: found.SUMMARY || fallback.summary,
        decisions: found.DECISIONS || fallback.decisions,
        actions: found['ACTION ITEMS'] || fallback.actions,
        full: found['FULL RECAP'] || fallback.full,
    };
}

function transcriptForAi(entries) {
    return entries.slice(-MAX_TRANSCRIPT_ENTRIES)
        .map(entry => `[${localTime(entry.timestamp)}] ${entry.sender}: ${entry.text}`)
        .join('\n');
}

function makeToken() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function viewTitle(view) {
    return ({ summary: 'SUMMARY', decisions: 'DECISIONS', actions: 'ACTION ITEMS', full: 'FULL RECAP' })[view] || 'SUMMARY';
}

function recapViewText(recap, view) {
    const normalized = ['summary', 'decisions', 'actions', 'full'].includes(view) ? view : 'summary';
    return `╭━━━〔 GROUP RECAP · ${viewTitle(normalized)} 〕━━━╮\n\n${recap.sections[normalized]}\n\n╰━━━━━━━━━━━━━━━━━━━━╯\n↻ Run .grouprecap again to reopen the four views.`;
}

function buttonActions(token) {
    return [
        { text: '🟦 Summary', id: `grouprecap:${token}:summary` },
        { text: '🟪 Decisions', id: `grouprecap:${token}:decisions` },
        { text: '🟧 Action Items', id: `grouprecap:${token}:actions` },
        { text: '🟩 Full Recap', id: `grouprecap:${token}:full` },
    ];
}

async function buildSections(entries, hours, ask = null) {
    const fallback = deterministicSections(entries, hours);
    const smartAsk = ask || require('./smartAI').ask;
    if (!entries.length || typeof smartAsk !== 'function') return fallback;
    const prompt = [
        'Analyze the following WhatsApp group transcript conservatively.',
        'Return exactly four plain-text sections with these headings: SUMMARY, DECISIONS, ACTION ITEMS, FULL RECAP.',
        'Do not invent people, decisions, deadlines, links, or facts. If evidence is missing, say that clearly.',
        'SUMMARY should identify the main topics and activity level.',
        'DECISIONS should include only explicit agreements or confirmed outcomes.',
        'ACTION ITEMS should include only explicit requests, tasks, or follow-ups.',
        'FULL RECAP should be a concise chronological account with speaker labels.',
        '',
        transcriptForAi(entries),
    ].join('\n');
    try {
        const result = await smartAsk({
            system: 'You are a privacy-conscious group conversation summarizer. Use only the supplied transcript and avoid unsupported inference.',
            user: prompt,
            remember: false,
        });
        return parseAiSections(result, fallback);
    } catch (_) {
        return fallback;
    }
}

async function execute({ sock, msg, from, args = [], reply, phoneNumber, isGroup }) {
    if (!isGroup || !String(from || '').endsWith('@g.us')) {
        return reply('👥 `.grouprecap` can only be used inside a WhatsApp group.');
    }
    const parsedHours = Number.parseFloat(String(args[0] || '12').replace(/[^0-9.]/g, ''));
    const hours = Math.min(72, Math.max(1, Number.isFinite(parsedHours) ? parsedHours : 12));
    const entries = getRecentMessages(phoneNumber, from, hours);
    const sections = await buildSections(entries, hours);
    const token = makeToken();
    const recap = { token, from, phoneNumber, createdAt: Date.now(), sections, messageKey: null };
    recaps.set(token, recap);
    while (recaps.size > MAX_RECAPS) recaps.delete(recaps.keys().next().value);
    const sent = await sendRoadmapButtons({
        sock,
        jid: from,
        quoted: msg,
        text: recapViewText(recap, 'summary'),
        prefix: '',
        actions: buttonActions(token),
    });
    recap.messageKey = sent?.key || null;
    return sent;
}

function callbackOriginalKey(message, fallbackKey, from) {
    if (fallbackKey?.id) return fallbackKey;
    const content = unwrapMessage(message);
    const response = content.interactiveResponseMessage
        || content.buttonsResponseMessage
        || content.templateButtonReplyMessage
        || content.extendedTextMessage
        || {};
    const context = response.contextInfo || content.contextInfo || {};
    const stanzaId = context.stanzaId || context.stanzaID;
    if (!stanzaId) return null;
    return { remoteJid: from, fromMe: true, id: stanzaId };
}

async function handleButton({ sock, msg, from, buttonId, reply }) {
    const match = String(buttonId || '').match(/^grouprecap:([^:]+):(summary|decisions|actions|full)$/);
    if (!match) return false;
    const recap = recaps.get(match[1]);
    if (!recap || Date.now() - recap.createdAt > RECAP_TTL_MS) {
        recaps.delete(match[1]);
        await reply('⌛ This group recap has expired. Run `.grouprecap` again to create a fresh one.');
        return true;
    }
    const text = recapViewText(recap, match[2]);
    const originalKey = callbackOriginalKey(msg, recap.messageKey, from);
    try {
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        if (!originalKey) throw new Error('original recap message key unavailable');
        await sock.sendMessage(from, { text, edit: originalKey });
    } catch (error) {
        console.warn('[GROUPRECAP button] edit unavailable:', error.message);
        await reply(text, { raw: true });
    }
    return true;
}

function clear() {
    groups.clear();
    recaps.clear();
}

module.exports = {
    MAX_MESSAGES_PER_GROUP,
    add: recordMessage,
    recordMessage,
    getRecentMessages,
    messageText,
    deterministicSections,
    parseAiSections,
    buildSections,
    execute,
    handleButton,
    recapViewText,
    buttonActions,
    clear,
};

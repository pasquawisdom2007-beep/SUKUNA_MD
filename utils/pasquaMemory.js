'use strict';

const MAX_MESSAGES = 80;
const MAX_FACTS = 40;
const MAX_TEXT = 700;

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

function keyFor(chatId) {
    return String(chatId || '').trim();
}

function ensureStore(database, chatId) {
    const key = keyFor(chatId);
    if (!key) return null;
    if (!database.data.chatMemory) database.data.chatMemory = {};
    if (!database.data.chatMemory[key]) {
        database.data.chatMemory[key] = { enabled: true, messages: [], facts: [], updatedAt: 0 };
    }
    const store = database.data.chatMemory[key];
    if (!Array.isArray(store.messages)) store.messages = [];
    if (!Array.isArray(store.facts)) store.facts = [];
    return store;
}

function isEnabled(database, chatId) {
    return ensureStore(database, chatId)?.enabled !== false;
}

function extractFacts(text, senderLabel = 'User') {
    const input = cleanText(text);
    const found = [];
    const patterns = [
        [/\bmy name is ([^.!?]{1,80})/i, 'name'],
        [/\bcall me ([^.!?]{1,80})/i, 'preferred name'],
        [/\bi am from ([^.!?]{1,80})/i, 'location'],
        [/\bi live in ([^.!?]{1,80})/i, 'location'],
        [/\bi work as ([^.!?]{1,80})/i, 'work'],
        [/\bi am a[n]? ([^.!?]{1,80})/i, 'identity'],
        [/\bmy goal is ([^.!?]{1,120})/i, 'goal'],
        [/\bremember that ([^.!?]{1,160})/i, 'note'],
    ];
    for (const [pattern, type] of patterns) {
        const match = input.match(pattern);
        if (match?.[1]) found.push({ type, text: `${type}: ${match[1].trim()}`, source: senderLabel });
    }
    return found;
}

function atmosphere(messages) {
    const text = messages.map(item => item.text).join(' ').toLowerCase();
    const scores = {
        positive: (text.match(/\b(good|great|happy|love|fun|thanks|excited|lol|haha|congrats)\b/g) || []).length,
        tense: (text.match(/\b(angry|mad|annoyed|fight|urgent|problem|hate|stressed|serious)\b/g) || []).length,
        sad: (text.match(/\b(sad|sorry|tired|hurt|cry|lost|alone|depressed)\b/g) || []).length,
        busy: (text.match(/\b(now|quick|asap|deadline| ಕೆಲಸ|work|meeting|help)\b/g) || []).length,
    };
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const label = !top || top[1] === 0 ? 'neutral / unclear' : top[0];
    return { label, scores };
}

function remember(database, chatId, { sender, senderLabel, text, fromMe = false } = {}) {
    const store = ensureStore(database, chatId);
    const clean = cleanText(text);
    if (!store || !clean || !store.enabled) return;
    store.messages.push({ sender: String(sender || ''), senderLabel: cleanText(senderLabel || sender || 'User').slice(0, 80), text: clean, fromMe: !!fromMe, at: Date.now() });
    store.messages = store.messages.slice(-MAX_MESSAGES);
    for (const fact of extractFacts(clean, senderLabel || sender || 'User')) {
        const duplicate = store.facts.some(item => item.text.toLowerCase() === fact.text.toLowerCase());
        if (!duplicate) store.facts.push({ ...fact, at: Date.now() });
    }
    store.facts = store.facts.slice(-MAX_FACTS);
    store.updatedAt = Date.now();
    database.save('chatMemory');
}

function getContext(database, chatId, limit = 24) {
    const store = ensureStore(database, chatId);
    if (!store || store.enabled === false) return { messages: [], facts: [], atmosphere: { label: 'disabled', scores: {} } };
    const messages = store.messages.slice(-Math.max(1, Math.min(Number(limit) || 24, MAX_MESSAGES)));
    return { messages, facts: store.facts.slice(-MAX_FACTS), atmosphere: atmosphere(messages) };
}

function transcript(context) {
    return context.messages.map(item => `${item.senderLabel || 'User'}: ${item.text}`).join('\n');
}

function clear(database, chatId) {
    const key = keyFor(chatId);
    if (!database.data.chatMemory) database.data.chatMemory = {};
    database.data.chatMemory[key] = { enabled: true, messages: [], facts: [], updatedAt: Date.now() };
    database.save('chatMemory');
}

function setEnabled(database, chatId, enabled) {
    const store = ensureStore(database, chatId);
    store.enabled = enabled === true;
    store.updatedAt = Date.now();
    database.save('chatMemory');
    return store.enabled;
}

module.exports = { ensureStore, isEnabled, remember, getContext, transcript, clear, setEnabled, atmosphere, extractFacts, MAX_MESSAGES, MAX_FACTS };

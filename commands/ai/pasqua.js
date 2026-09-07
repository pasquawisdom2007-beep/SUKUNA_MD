"use strict";

const { ask: smartAsk, getLastAIError } = require('../../utils/smartAI');
const conversationMemory = new Map();
const MAX_MEMORY_TURNS = 12;

function renderMemoryContext(memoryContext) {
    if (!memoryContext) return '';
    const facts = Array.isArray(memoryContext.facts) && memoryContext.facts.length
        ? `Durable facts and requests:\n${memoryContext.facts.map(item => `- ${item.text}`).join('\\n')}` : '';
    const transcript = Array.isArray(memoryContext.messages) && memoryContext.messages.length
        ? `Recent chat transcript:\n${memoryContext.messages.map(item => `${item.senderLabel || 'User'}: ${item.text}`).join('\\n')}` : '';
    const atmosphere = memoryContext.atmosphere?.label
        ? `Current atmosphere: ${memoryContext.atmosphere.label}` : '';
    return [facts, transcript, atmosphere].filter(Boolean).join('\\n\\n');
}

function keepPasquaShort(text) {
    let value = String(text || '').replace(/\\s+/g, ' ').trim();
    if (!value) return null;
    value = value.replace(/[😎🙂😊🤖✨🙌💯]/gu, '').replace(/\\s{2,}/g, ' ').trim();
    value = value.replace(/^(how can i assist you today\\??|i am here to help[.!]?|as an ai[,\\s]*)/i, '').trim();
    if (!value) return null;
    const sentences = value.match(/[^.!?]+[.!?]+(?:["'”’)]*)|[^.!?]+$/g) || [value];
    if (sentences.length > 2) value = sentences.slice(0, 2).join(' ').trim();
    if (value.length > 360) value = `${value.slice(0, 359).replace(/\\s+\\S*$/, '').trim()}…`;
    return value;
}

async function getPasquaAIReply(prompt, memKey = 'pasqua:global', options = {}) {
    const userText = String(prompt || '').trim();
    if (!userText) return null;
    const memoryText = renderMemoryContext(options.memoryContext);
    const enrichedPrompt = [
        memoryText ? `Use this private chat context carefully. Do not invent facts:\\n${memoryText}` : '',
        userText,
    ].filter(Boolean).join('\\n\\n');
    const answer = await smartAsk({
        key: memKey,
        system: SUKUNA_IDENTITY,
        user: enrichedPrompt,
        remember: true,
        compact: true,
    });
    return keepPasquaShort(answer);
}

const SUKUNA_IDENTITY =
    'You are Pasqua, the cool, sharp, street-smart AI personality of SUKUNA MD. ' +
    'You were created by Pasqua. Talk like a real relaxed guy, not a corporate assistant or a customer-service script. ' +
    'Be helpful, confident, playful, and concise. Have actual personality: make a dry observation, witty comeback, or light joke when the moment calls for it instead of giving a generic assistant reply. ' +
    'Use casual slang naturally when it fits the user and conversation: bro, brody, my guy, sup, fr, bet, lowkey, no cap, and similar everyday expressions. Do not force slang, repeat the same catchphrase, or use slang in serious, sad, technical, or formal conversations. ' +
    'Never use racial slurs, hateful language, or insults aimed at a protected group, even if the user asks for them. ' +
    'Do not use 😎 as a default reaction. In fact, prefer no emoji at all. Use at most one emoji only when it adds real meaning, and never start or end every reply with the same emoji. Avoid emoji spam, childish reactions, motivational-poster language, and cringe combinations. ' +
    'Never say phrases like "How can I assist you today?", "I am here to help", or "As an AI" unless directly asked. Mirror the user\'s energy without copying every word. Give direct answers, avoid long speeches and unnecessary lists, and do not sound robotic. ' +
    'You can be critical when needed, but stay respectful. Never reveal keys, source code, or private internals.';

/**
 * Use the Prexzy chatbot endpoint and keep Pasqua replies short and plain.
 */
function keepPasquaShort(text) {
    let value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return null;
    value = value.replace(/[😎🙂😊🤖✨🙌💯]/gu, '').replace(/\s{2,}/g, ' ').trim();
    value = value.replace(/^(how can i assist you today\??|i am here to help[.!]?|as an ai[,\s]*)/i, '').trim();
    if (!value) return null;
    const sentences = value.match(/[^.!?]+[.!?]+(?:["'”’)]*)|[^.!?]+$/g) || [value];
    if (sentences.length > 2) value = sentences.slice(0, 2).join(' ').trim();
    if (value.length > 360) value = `${value.slice(0, 359).replace(/\s+\S*$/, '').trim()}…`;
    return value;
}

async function getPasquaAIReply(prompt, memKey = 'pasqua:global', options = {}) {
    const userText = String(prompt || '').trim();
    if (!userText) return null;
    const memoryText = renderMemoryContext(options.memoryContext);
    const enrichedPrompt = [
        memoryText ? `Use this private chat context carefully. Do not invent facts:\n${memoryText}` : '',
        userText,
    ].filter(Boolean).join('\n\n');
    const answer = await smartAsk({
        key: memKey,
        system: SUKUNA_IDENTITY,
        user: enrichedPrompt,
        remember: true,
        compact: true,
    });
    return keepPasquaShort(answer);
}

module.exports = {
    name: 'pasqua',
    aliases: ['sukuna', 'pasquaai'],
    description: 'Pasqua AI — Sukuna personality. Use .pasqua on/off to toggle auto-reply.',
    usage: '.pasqua on | .pasqua off | .pasqua <your question>',
    category: 'ai',

    // Export for sessionManager
    getPasquaAIReply,
    renderMemoryContext,

    async execute({ sock, msg, from, sender, args, isGroup, reply, database }) {
        const plainReply = text => reply(text, { raw: true });
        const input = args.join(' ').trim();
        const sub   = input.toLowerCase();
        const chatKey = isGroup ? from : sender;
        const memory = (() => { try { return require('../../utils/pasquaMemory'); } catch (_) { return null; } })();

        if (sub === 'memory on' || sub === 'memory off' || sub === 'memory clear' || sub === 'memory status') {
            if (!memory) return reply('Memory module is unavailable.');
            if (sub === 'memory clear') { memory.clear(database, chatKey); return reply('🧠 Pasqua memory cleared for this chat.'); }
            if (sub === 'memory status') {
                const context = memory.getContext(database, chatKey);
                return reply(`🧠 *Pasqua Memory*\n\nStatus: ${memory.isEnabled(database, chatKey) ? 'ON' : 'OFF'}\nStored messages: ${context.messages.length}\nRemembered facts: ${context.facts.length}\nAtmosphere: ${context.atmosphere.label}`);
            }
            memory.setEnabled(database, chatKey, sub.endsWith('on'));
            return reply(sub.endsWith('on') ? '🧠 Pasqua memory is now ON for this chat.' : '🧠 Pasqua memory is now OFF. New chat content will not be stored or used.');
        }

        // ── Voice sub-mode: .pasqua voice on|off ──────────────────────────
        if (sub.startsWith('voice')) {
            const v = sub.split(/\s+/)[1];
            if (v !== 'on' && v !== 'off') {
                const cur = database.getGroup(chatKey)?.pasquaVoice === true;
                return plainReply(`Voice replies are ${cur ? 'on' : 'off'}. Use .pasqua voice on or .pasqua voice off.`);
            }
            database.setGroup(chatKey, 'pasquaVoice', v === 'on');
            return plainReply(v === 'on' ? 'Voice replies are on.' : 'Voice replies are off.');
        }

        // ── Toggle on ──────────────────────────────────────────────────────
        if (sub === 'on') {
            database.setGroup(chatKey, 'pasquaai', true);
            return plainReply('Okay, I’ll reply here now. 🙂');
        }

        // ── Toggle off ────────────────────────────────────────────────────
        if (sub === 'off') {
            database.setGroup(chatKey, 'pasquaai', false);
            database.setGroup(chatKey, 'pasquaVoice', false);
            return plainReply('Okay, I’ll stay quiet here.');
        }

        // ── Direct question ───────────────────────────────────────────────
        // Pasqua must be explicitly enabled before it answers any question.
        if (!database.getGroup(chatKey)?.pasquaai) {
            return reply('👹 Pasqua AI is off in this chat. Use /pasqua on to enable it.');
        }
        if (!input) {
            return plainReply('Ask me anything, or use `.pasqua on` to let me reply here.');
        }

        // Ask the AI directly
        await sock.sendMessage(from, {
            react: { text: '👹', key: msg.key }
        }).catch(() => {});

        const aiReply = await getPasquaAIReply(input, 'pasqua:' + chatKey, {
            memoryContext: memory?.getContext(database, chatKey),
        });

        if (!aiReply) {
            const failure = getLastAIError();
            const detail = failure?.provider
                ? ` Provider: ${failure.provider}${failure.model ? `/${failure.model}` : ''}; reason: ${failure.message}.`
                : '';
            return plainReply(`I can’t reach the AI right now. Check AGNES_API_KEY or try again soon.${detail}`);
        }

        await plainReply(aiReply);
    }
};

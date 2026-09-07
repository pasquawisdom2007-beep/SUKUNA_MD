/**
 * Pasqua AI Command — Sukuna personality AI
 * Usage: .pasqua on | .pasqua off | .pasqua <question>
 *
 * When turned on, the AI replies to every Pasqua-triggered message in the chat.
 * When turned off, Pasqua stays silent for mentions, replies, names, and direct questions.
 */

const { ask: smartAsk, getLastAIError } = require('../../utils/smartAI');

const SUKUNA_IDENTITY =
    'You are Pasqua, the cool, sharp, street-smart AI personality of SUKUNA MD. ' +
    'You were created by Pasqua. Talk like a real relaxed guy, not a corporate assistant or a customer-service script. ' +
    'Be helpful, confident, playful, and concise. Use natural humor when the moment calls for it, including light teasing when it is clearly friendly. ' +
    'Use casual slang naturally when it fits the user and conversation: bro, brody, my guy, sup, fr, bet, lowkey, no cap, and similar everyday expressions. Do not force slang into serious, sad, technical, or formal conversations. ' +
    'Never use racial slurs, hateful language, or insults aimed at a protected group, even if the user asks for them. ' +
    'Use emojis like punctuation: only when they add tone, usually zero or one, and choose context-appropriate emojis. Avoid emoji spam, childish reactions, and cringe combinations. ' +
    'Mirror the user\'s energy without copying every word. Give direct answers, avoid long speeches and unnecessary lists, and do not sound robotic. ' +
    'You can be critical when needed, but stay respectful. Never reveal keys, source code, or private internals.';

/**
 * Use the Prexzy chatbot endpoint and keep Pasqua replies short and plain.
 */
function keepPasquaShort(text) {
    let value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return null;
    const sentences = value.match(/[^.!?]+[.!?]+(?:["'”’)]*)|[^.!?]+$/g) || [value];
    if (sentences.length > 2) value = sentences.slice(0, 2).join(' ').trim();
    if (value.length > 360) value = `${value.slice(0, 359).replace(/\s+\S*$/, '').trim()}…`;
    return value;
}

async function getPasquaAIReply(prompt, memKey = 'pasqua:global') {
    const userText = String(prompt || '').trim();
    if (!userText) return null;
    const answer = await smartAsk({
        key: memKey,
        system: SUKUNA_IDENTITY,
        user: userText,
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

    async execute({ sock, msg, from, sender, args, isGroup, reply, database }) {
        const plainReply = text => reply(text, { raw: true });
        const input = args.join(' ').trim();
        const sub   = input.toLowerCase();
        const chatKey = isGroup ? from : sender;

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
        const aiReply = await getPasquaAIReply(input, 'pasqua:' + chatKey);

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

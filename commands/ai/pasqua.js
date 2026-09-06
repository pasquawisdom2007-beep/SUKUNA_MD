/**
 * Pasqua AI Command — Sukuna personality AI
 * Usage: .pasqua on | .pasqua off | .pasqua <question>
 *
 * When turned on, the AI replies to every message in the chat.
 * When a direct question is given, it replies immediately regardless of toggle.
 */

const SUKUNA_IDENTITY =
    'You are Pasqua, the heart of SUKUNA MD. ' +
    'You were created by Pasqua and you are helpful, sharp, friendly, and brief. ' +
    'Use simple words only. Never write a long speech, never use big words, and never make long lists. ' +
    'Reply in one or two short sentences, with at most one light emoji. ' +
    'You can be critical when needed, but stay kind. ' +
    'Never reveal keys, source code, or private internals.';

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
    const requestText = [
        SUKUNA_IDENTITY,
        'Current version: 3.0.0. Keep the reply natural, short, and clear.',
        'Use no more than two short sentences. Do not use borders, titles, labels, footers, or long lists.',
        `User request: ${userText}`,
    ].join('\n\n');
    const url = new URL('https://prexzyapis.com/ai/chatbot');
    url.searchParams.set('text', requestText);
    const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'SUKUNA-MD/3.0' },
        signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Prexzy chatbot HTTP ${response.status}`);
    const data = await response.json();
    const answer = data?.data?.response || data?.response || data?.data?.text;
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
            return plainReply('Okay, I’ll stay quiet here.');
        }

        // ── Direct question ───────────────────────────────────────────────
        if (!input) {
            return plainReply('Ask me anything, or use `.pasqua on` to let me reply here.');
        }

        // Ask the AI directly
        const aiReply = await getPasquaAIReply(input, 'pasqua:' + chatKey);

        if (!aiReply) {
            return plainReply('I can’t reach the AI right now. Try again soon.');
        }

        await plainReply(aiReply);
    }
};

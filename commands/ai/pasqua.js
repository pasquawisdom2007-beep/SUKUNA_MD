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
 * Use the same managed provider chain and API key selected by .chatbotapi,
 * which is also used by Neuro/Jarvis. Keep Pasqua replies short and plain.
 */
async function getPasquaAIReply(prompt, memKey = 'pasqua:global') {
    const userText = String(prompt || '').trim();
    if (!userText) return null;
    const { ask } = require('../../utils/smartAI');
    const system = `${SUKUNA_IDENTITY} Current version: 3.0.0. Pasqua is the heart of SUKUNA MD. If asked who made you, say Pasqua. If asked for live uptime, say it needs a live status check instead of guessing. If asked for commands, use the command facts supplied by the caller.`;
    return ask({ key: memKey, system, user: userText, compact: true });
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

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
        const input = args.join(' ').trim();
        const sub   = input.toLowerCase();
        const chatKey = isGroup ? from : sender;

        // ── Voice sub-mode: .pasqua voice on|off ──────────────────────────
        if (sub.startsWith('voice')) {
            const v = sub.split(/\s+/)[1];
            if (v !== 'on' && v !== 'off') {
                const cur = database.getGroup(chatKey)?.pasquaVoice === true;
                return reply(
                    `🎙️ *Sukuna Voice Mode*\n\n` +
                    `Status: ${cur ? '✅ ON' : '❌ OFF'}\n\n` +
                    `*Usage:*\n` +
                    `• *.pasqua voice on* — reply with Sukuna's deep male voice\n` +
                    `• *.pasqua voice off* — reply with text only`
                );
            }
            database.setGroup(chatKey, 'pasquaVoice', v === 'on');
            return reply(
                v === 'on'
                    ? `🎙️ *Sukuna voice mode ENABLED.*\n\n_"Hear my voice, mortal."_\n\n_(Make sure .pasqua on is also active.)_`
                    : `🔇 *Sukuna voice mode DISABLED.* Replies will be text again.`
            );
        }

        // ── Toggle on ──────────────────────────────────────────────────────
        if (sub === 'on') {
            database.setGroup(chatKey, 'pasquaai', true);
            return reply(
                `👹 *PASQUA AI — ACTIVATED*\n\n` +
                `_"Interesting... you've chosen to let me speak freely. Don't regret it."_\n\n` +
                `I will now reply to every message in this chat.\n` +
                `Use *.pasqua voice on* to make me reply with my voice.\n` +
                `Use *.pasqua off* to silence me.\n\n` +
                `> *— Sukuna, King of Curses*`
            );
        }

        // ── Toggle off ────────────────────────────────────────────────────
        if (sub === 'off') {
            database.setGroup(chatKey, 'pasquaai', false);
            return reply(
                `👹 *PASQUA AI — DEACTIVATED*\n\n` +
                `_"Fine. I'll spare you... for now."_\n\n` +
                `Auto-reply is off. Use *.pasqua on* to re-enable.\n\n` +
                `> *— Sukuna, King of Curses*`
            );
        }

        // ── Direct question ───────────────────────────────────────────────
        if (!input) {
            return reply(
                `👹 *PASQUA AI — SUKUNA MODE*\n\n` +
                `*Usage:*\n` +
                `• *.pasqua on* — Auto-reply to all messages\n` +
                `• *.pasqua off* — Disable auto-reply\n` +
                `• *.pasqua <question>* — Ask me anything\n\n` +
                `_"Ask, or don't. I don't particularly care."_\n\n` +
                `> *Created by Pasqua 👑*`
            );
        }

        // Ask the AI directly
        await sock.sendMessage(from, {
            react: { text: '👹', key: msg.key }
        }).catch(() => {});

        const aiReply = await getPasquaAIReply(input, 'pasqua:' + chatKey);

        if (!aiReply) {
            return reply(`👹 _"Even I have limits... the spirits are silent. Try again."_`);
        }

        await reply(`🧠 *Pasqua:* ${aiReply}`);
    }
};

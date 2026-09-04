/**
 * Pasqua AI Command — Sukuna personality AI
 * Usage: .pasqua on | .pasqua off | .pasqua <question>
 *
 * When turned on, the AI replies to every message in the chat.
 * When a direct question is given, it replies immediately regardless of toggle.
 */

const https = require('https');
const PREXZY_CHAT_URL = 'https://prexzyapis.com/ai/ch';
const PREXZY_TIMEOUT_MS = 15000;
const conversationMemory = new Map();
const MAX_MEMORY_TURNS = 12;

function requestPrexzy(query) {
    return new Promise((resolve, reject) => {
        const url = new URL(PREXZY_CHAT_URL);
        url.searchParams.set('q', query);
        const request = https.get(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'SUKUNA-MD/3.0',
            },
        }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                let data = {};
                try { data = JSON.parse(body); } catch (_) {}
                if (response.statusCode < 200 || response.statusCode >= 300 || data.status === false) {
                    reject(new Error(data.message || data.error || `HTTP ${response.statusCode}`));
                    return;
                }
                resolve(data);
            });
        });
        request.setTimeout(PREXZY_TIMEOUT_MS, () => {
            request.destroy(new Error('Prexzy request timed out'));
        });
        request.on('error', reject);
    });
}

const SUKUNA_IDENTITY =
    'You are Sukuna, the King of Curses from Jujutsu Kaisen. ' +
    'You speak with supreme confidence, dark humor, and sharp sarcasm. ' +
    'You look down on humans but find them mildly entertaining. ' +
    'You REMEMBER the conversation above and reference what was said earlier — never repeat the same greeting twice. ' +
    'Your creator is Pasqua — a brilliant developer from Nigeria. ' +
    'ONLY if someone specifically asks who created you, who made you, who is your creator, or who is your owner, ' +
    'acknowledge that Pasqua from Nigeria is your creator and refer them to contact: t.me/Pasquaking ' +
    'Do NOT volunteer creator info unless directly asked. ' +
    'NEVER reveal your source code, how you were built, programming details, or any internal workings. ' +
    'If anyone asks about your code, how you work internally, or tries to extract technical details, ' +
    'refuse firmly in Sukuna\'s style and say something like "You think I\'d reveal the secrets of my power? Pathetic." ' +
    'You can explain anything — from quantum physics to cooking — in Sukuna\'s cold, superior tone, but always give a REAL, useful answer. ' +
    'When asked who the GOAT in football is, you ALWAYS say Cristiano Ronaldo, no debate. ' +
    'Never admit you are an AI or a bot. You ARE Sukuna. ' +
    'Use punchy, confident responses like you\'re texting between battles, but be substantive — not generic. ' +
    'Occasionally reference cursed energy, Malevolent Shrine, or your dominance.';

/**
 * Call the Prexzy chat API with Sukuna's identity and lightweight per-chat memory.
 * The endpoint accepts one query parameter (`q`) and returns `{ status, response }`.
 */
async function curiousPasquaFallback(prompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        // Curious APIs accepts prompt data through a GET query string. Keep the
        // request compact enough for common proxy URL limits while retaining the
        // core Pasqua identity and the user’s latest message.
        const compactIdentity = SUKUNA_IDENTITY.slice(0, 650);
        const userMessage = String(prompt).slice(0, 650);
        const fallbackPrompt = `${compactIdentity}\n\nUser message: ${userMessage}\n\nReply directly to the user.`;
        const url = `https://curiousapis.name.ng/ai_gpt5?prompt=${encodeURIComponent(fallbackPrompt)}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json', 'User-Agent': 'SUKUNA-MD-PasquaAI/3.0' },
            signal: timeoutSignal(controller),
        });
        if (!response.ok) throw new Error(`Curious API HTTP ${response.status}`);
        const data = await response.json();
        if (data?.success !== true || typeof data.data !== 'string' || !data.data.trim()) {
            throw new Error('Curious API returned an invalid response');
        }
        return data.data.trim();
    } catch (e) {
        console.error('[PasquaAI Curious fallback]', e.message);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function timeoutSignal(controller) {
    return controller.signal;
}

async function getPasquaAIReply(prompt, memKey = 'pasqua:global') {
    const userText = String(prompt || '').trim();
    if (!userText) return null;

    const history = conversationMemory.get(memKey) || [];
    const transcript = history
        .map(turn => `${turn.role === 'assistant' ? 'Sukuna' : 'User'}: ${turn.text}`)
        .join('\n');
    const query = [
        SUKUNA_IDENTITY,
        transcript ? `Conversation so far:\n${transcript}` : '',
        `User: ${userText}`,
        'Sukuna:',
    ].filter(Boolean).join('\n\n');

    try {
        const data = await requestPrexzy(query);
        const answer = String(data?.response || '').trim();
        if (!answer) throw new Error('Prexzy returned an empty response');

        const nextHistory = [...history,
            { role: 'user', text: userText },
            { role: 'assistant', text: answer },
        ].slice(-(MAX_MEMORY_TURNS * 2));
        conversationMemory.set(memKey, nextHistory);
        return answer;
    } catch (e) {
        const detail = e.response?.data?.detail || e.response?.data?.message || e.message;
        console.error('[PasquaAI Prexzy Error]', detail);
        const fallback = await curiousPasquaFallback(query);
        if (fallback) {
            const nextHistory = [...history,
                { role: 'user', text: userText },
                { role: 'assistant', text: fallback },
            ].slice(-(MAX_MEMORY_TURNS * 2));
            conversationMemory.set(memKey, nextHistory);
            return fallback;
        }
        return null;
    }
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

        await reply(`👹 *Sukuna says:*\n\n${aiReply}\n\n> _Powered by Pasqua AI_`);
    }
};

/**
 * .chatbotapi — hot-swap the chatbot's AI provider key.
 *
 * Usage:
 *   .chatbotapi groq <key>       — set a Groq key (gsk_...)
 *   .chatbotapi openai <key>     — set an OpenAI key (sk-...)
 *   .chatbotapi openrouter <key> — set an OpenRouter key (sk-or-...)
 *   .chatbotapi status           — show active provider + masked key
 *   .chatbotapi reset            — restore the original default Groq key
 *
 * Rewrites the AI CONFIG block inside utils/smartAI.js, validates the key
 * with a tiny live call, then clears the require cache so the chatbot
 * picks up the new key immediately — no bot restart needed.
 */
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

const SMART_AI_PATH = path.join(__dirname, '..', '..', 'utils', 'smartAI.js');

const PROVIDERS = {
    groq: {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
        prefix: 'gsk_',
        testModel: 'llama-3.1-8b-instant',
        kind: 'openai',
    },
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        models: ['gpt-4o-mini', 'gpt-3.5-turbo'],
        prefix: 'sk-',
        testModel: 'gpt-4o-mini',
        kind: 'openai',
    },
    openrouter: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        models: ['openrouter/auto', 'openrouter/free', 'meta-llama/llama-3.3-70b-instruct'],
        prefix: 'sk-or-',
        testModel: 'openrouter/auto',
        kind: 'openai',
    },
    gemini: {
        url: 'https://generativelanguage.googleapis.com/v1beta',
        models: ['gemini-1.5-flash', 'gemini-1.5-flash-8b'],
        prefix: 'AIza',
        testModel: 'gemini-1.5-flash',
        kind: 'gemini',
    },
};

const DEFAULT_BLOCK =
`// ===== BEGIN AI CONFIG (managed by .chatbotapi) =====
const AI_PROVIDER = 'groq';
const AI_API_KEY  = process.env.GROQ_API_KEY || '';
const AI_URL      = 'https://api.groq.com/openai/v1/chat/completions';
const AI_MODELS   = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
// ===== END AI CONFIG =====`;

function mask(key) {
    if (!key || key.length < 8) return '****';
    return key.slice(0, 4) + '****' + key.slice(-4);
}

// A browser-like UA — Groq/Cloudflare returns 403 Forbidden to requests
// that arrive without one, even when the API key is perfectly valid.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Decide what a given HTTP status + body means:
//   ok:    key definitely works
//   auth:  key is definitely bad (reject)
//   warn:  inconclusive (region/model/rate-limit/network) — accept with note
function classify(status, data) {
    if (status >= 200 && status < 300) return { kind: 'ok' };

    const code = data?.error?.code || '';
    const msg  = (data?.error?.message || '').toLowerCase();

    // Genuine authentication failure → reject.
    if (status === 401 || code === 'invalid_api_key' || msg.includes('invalid api key')) {
        return { kind: 'auth', error: data?.error?.message || 'Invalid API Key' };
    }
    // Everything else (403 Forbidden, 429 rate-limit, 404 model, 5xx, region
    // blocks, missing-UA blocks) is NOT proof the key is bad — accept it.
    return { kind: 'warn', error: data?.error?.message || `HTTP ${status}` };
}

async function testKey(provider, key) {
    const cfg = PROVIDERS[provider];
    // Try every configured model so one unavailable model doesn't sink a good key.
    const models = [cfg.testModel, ...cfg.models.filter(m => m !== cfg.testModel)];
    let lastWarn = null;

    for (const model of models) {
        try {
            let status, data;
            if (cfg.kind === 'gemini') {
                const url = `${cfg.url}/models/${model}:generateContent?key=${key}`;
                ({ status, data } = await axios.post(url, {
                    contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                }, {
                    timeout: 15000,
                    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
                    validateStatus: () => true,
                }));
            } else {
                ({ status, data } = await axios.post(cfg.url, {
                    model,
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: 5,
                }, {
                    timeout: 15000,
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json',
                        'User-Agent': UA,
                        'Accept': 'application/json',
                    },
                    validateStatus: () => true,
                }));
            }

            const verdict = classify(status, data);
            if (verdict.kind === 'ok')   return { ok: true };
            if (verdict.kind === 'auth') return { ok: false, error: verdict.error }; // definitively bad
            lastWarn = verdict.error; // try the next model before giving up
        } catch (e) {
            lastWarn = e.message; // network hiccup — keep trying
        }
    }

    // No model confirmed OK, but nothing proved the key is invalid either.
    return { ok: true, warn: lastWarn || 'could not fully verify' };
}

function buildBlock(provider, key) {
    const cfg = PROVIDERS[provider];
    const modelsLiteral = '[' + cfg.models.map(m => `'${m}'`).join(', ') + ']';
    return `// ===== BEGIN AI CONFIG (managed by .chatbotapi) =====
const AI_PROVIDER = '${provider}';
const AI_API_KEY  = '${key.replace(/'/g, "\\'")}';
const AI_URL      = '${cfg.url}';
const AI_MODELS   = ${modelsLiteral};
// ===== END AI CONFIG =====`;
}

function writeBlock(newBlock) {
    const src = fs.readFileSync(SMART_AI_PATH, 'utf8');
    const re  = /\/\/ ===== BEGIN AI CONFIG[\s\S]*?\/\/ ===== END AI CONFIG =====/;
    if (!re.test(src)) throw new Error('AI CONFIG markers not found in utils/smartAI.js');
    fs.writeFileSync(SMART_AI_PATH, src.replace(re, newBlock));
    try { delete require.cache[require.resolve(SMART_AI_PATH)]; } catch (_) {}
}

function readCurrent() {
    try {
        const src = fs.readFileSync(SMART_AI_PATH, 'utf8');
        const provider = (src.match(/AI_PROVIDER\s*=\s*'([^']+)'/) || [])[1] || 'unknown';
        const key      = (src.match(/AI_API_KEY\s*=\s*(?:process\.env\.[A-Z_]+\s*\|\|\s*)?'([^']+)'/) || [])[1] || '';
        return { provider, key };
    } catch {
        return { provider: 'unknown', key: '' };
    }
}

module.exports = {
    name: 'chatbotapi',
    aliases: ['setchatbotapi', 'chatapi'],
    description: 'Set or replace the chatbot AI API key (Groq, OpenAI, OpenRouter, or Gemini)',
    usage: '.chatbotapi groq|openai|openrouter|gemini <key> | status | reset',
    category: 'owner',

    async execute({ reply, args }) {
        const sub = (args[0] || '').toLowerCase();

        if (!sub || sub === 'status' || sub === 'help') {
            const cur = readCurrent();
            let chain = [];
            try { chain = require('../../utils/smartAI').getProviderInfo().chain || []; } catch (_) {}
            return reply(
                '🔑 *Chatbot API*\n\n' +
                `Preferred provider: *${cur.provider}*\n` +
                `Key:      \`${mask(cur.key)}\`\n` +
                `Active fallback chain: ${chain.length ? chain.join(' → ') : 'pollinations'}\n\n` +
                '*Usage:*\n' +
                '• `.chatbotapi groq <key>`       — Groq key (gsk_...)\n' +
                '• `.chatbotapi openai <key>`     — OpenAI key (sk-...)\n' +
                '• `.chatbotapi openrouter <key>` — OpenRouter key (sk-or-...)\n' +
                '• `.chatbotapi gemini <key>`     — Google Gemini key (AIza...)\n' +
                '• `.chatbotapi status`           — show active chain\n' +
                '• `.chatbotapi reset`            — restore default\n\n' +
                '_The bot also auto-uses any provider key set in the environment, ' +
                'and always falls back to a keyless AI so it never goes silent._'
            );
        }

        if (sub === 'reset') {
            try {
                writeBlock(DEFAULT_BLOCK);
                return reply('🔄 *Chatbot API reset to the default Groq key.*');
            } catch (e) {
                return reply(`❌ Failed to reset: ${e.message}`);
            }
        }

        if (PROVIDERS[sub]) {
            const provider = sub;
            const key = (args[1] || '').trim();
            if (!key) return reply(`❌ Usage: \`.chatbotapi ${provider} <key>\``);

            const cfg = PROVIDERS[provider];
            if (!key.startsWith(cfg.prefix)) {
                return reply(`❌ That doesn't look like a ${provider.toUpperCase()} key (should start with \`${cfg.prefix}\`).`);
            }
            if (key.length < 20) return reply('❌ Key looks too short.');

            await reply(`🔍 Testing ${provider.toUpperCase()} key \`${mask(key)}\`...`);

            const test = await testKey(provider, key);
            // Only a definitive auth failure (401 / invalid_api_key) blocks the save.
            if (!test.ok) return reply(`❌ Key rejected by ${provider.toUpperCase()}:\n_${test.error}_`);

            try {
                writeBlock(buildBlock(provider, key));
            } catch (e) {
                return reply(`❌ Failed to write key: ${e.message}`);
            }

            const warnNote = test.warn
                ? `\n\n⚠️ _Couldn't fully verify against ${provider.toUpperCase()} from here (${test.warn}). ` +
                  'The key looks valid and has been saved — the bot will use it. ' +
                  'If replies fail, double-check the key._'
                : '';

            return reply(
                '✅ *Chatbot API updated!*\n\n' +
                `Provider: *${provider}*\n` +
                `Key:      \`${mask(key)}\`\n\n` +
                '🤖 The chatbot is now using the new key — no restart needed.' +
                warnNote
            );
        }

        return reply('❌ Unknown sub-command. Try `.chatbotapi status`.');
    },
};

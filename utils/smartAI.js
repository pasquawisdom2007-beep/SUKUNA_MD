/**
 * Smart AI helper — multi-provider, self-healing AI with conversation memory.
 *
 * Priority chain (first success wins):
 *   1. The provider set by `.chatbotapi` (the managed CONFIG block below)
 *   2. Any provider whose API key is present in the environment
 *        GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY,
 *        OPENROUTER_API_KEY, AI_GATEWAY_API_KEY
 *   3. Prexzy (KEYLESS) — default provider when no user API key is configured.
 *   4. Pollinations (KEYLESS) — final backup so the bot never goes silent.
 *
 * The block between BEGIN AI CONFIG and END AI CONFIG is rewritten by
 * the `.chatbotapi` command. Do not remove the marker comments.
 */
const axios = require('axios');

// ┌──────────────────────────────────────────────────────────────────────┐
// │ DIRECT AGNES CONFIG                                                   │
// │ Paste your Agnes secret between the quotes if you want file-based     │
// │ configuration. Leave empty to use AGNES_API_KEY from the environment. │
// │ Never paste the real key into a public commit or screenshot.          │
// └──────────────────────────────────────────────────────────────────────┘
const AGNES_API_KEY_FILE = 'sk-eH4OYzZKxs95ZGj8oP5WmzTeobKUX6wc4qvAoJyRLG0Yl8Nr';
const AGNES_MODEL_FILE = 'agnes-2.5-flash';

// ===== BEGIN AI CONFIG (managed by .chatbotapi) =====
// Agnes is the default Pasqua AI provider.
const AI_PROVIDER = 'agnes';
const AI_API_KEY  = AGNES_API_KEY_FILE.trim() || process.env.AGNES_API_KEY || '';
const AI_URL      = 'https://apihub.agnes-ai.com/v1/chat/completions';
const AI_MODELS   = [AGNES_MODEL_FILE || process.env.AGNES_MODEL || 'agnes-2.5-flash'];
// ===== END AI CONFIG =====

const MAX_TURNS  = 12;
// Shorter per-attempt timeout so a slow/stalled provider fails fast and the
// chain moves on to the next one instead of making the user wait.
const TIMEOUT_MS = 12000;

// Vercel AI Gateway key — accept either the classic AI_GATEWAY_API_KEY or the
// VERCEL_AI_GATEWAY_KEY that the Vercel project exposes.
const GATEWAY_KEY = process.env.VERCEL_AI_GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY || '';
let lastProviderError = null;
let lastProviderFailures = [];

/* ------------------------------------------------------------------ *
 * Provider registry
 * ------------------------------------------------------------------ */

// OpenAI-compatible chat providers (Groq, OpenAI, OpenRouter, AI Gateway).
function openAICompatible({ name, url, key, models }) {
    return {
        name,
        key,
        models,
        supportsVision: true,
        async call(model, messages) {
            const { data, status } = await axios.post(url, {
                model,
                messages,
                temperature: 0.8,
                max_tokens: 700,
            }, {
                timeout: TIMEOUT_MS,
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    // Browser-like UA avoids 403 Forbidden blocks from Groq/Cloudflare.
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    'Accept': 'application/json',
                    'HTTP-Referer': 'https://github.com/pasquawisdom2007-beep/Sukuna-MD-V3',
                    'X-Title': 'SUKUNA MD',
                },
                validateStatus: () => true,
            });
            if (status < 200 || status >= 300) {
                const error = new Error(data?.error?.message || `HTTP ${status}`);
                error.status = status;
                throw error;
            }
            const txt = data?.choices?.[0]?.message?.content;
            return (txt && String(txt).trim()) || null;
        },
    };
}

// Google Gemini (different request/response shape).
function geminiProvider(key) {
    const models = ['gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    return {
        name: 'gemini',
        key,
        models,
        supportsVision: true,
        async call(model, messages) {
            // Fold system + history into Gemini's contents format.
            const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
            const toParts = content => {
                if (typeof content === 'string') return [{ text: content }];
                if (!Array.isArray(content)) return [{ text: String(content || '') }];
                return content.flatMap(item => {
                    if (item?.type === 'text') return [{ text: String(item.text || '') }];
                    if (item?.type === 'image_url') {
                        const url = String(item.image_url?.url || '');
                        const match = url.match(/^data:([^;]+);base64,(.+)$/);
                        return match ? [{ inlineData: { mimeType: match[1], data: match[2] } }] : [];
                    }
                    return [];
                });
            };
            const contents = messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: toParts(m.content),
                }));
            const body = { contents };
            if (sys) body.systemInstruction = { parts: [{ text: sys }] };

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const { data, status } = await axios.post(url, body, {
                timeout: TIMEOUT_MS,
                headers: { 'Content-Type': 'application/json' },
                validateStatus: () => true,
            });
            if (status < 200 || status >= 300) {
                const error = new Error(data?.error?.message || `HTTP ${status}`);
                error.status = status;
                throw error;
            }
            const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            return (txt && String(txt).trim()) || null;
        },
    };
}

// Prexzy — KEYLESS default text API. It returns { status, response }.
function prexzyProvider() {
    return {
        name: 'prexzy',
        key: 'keyless',
        models: ['prexzy-chat'],
        async call(_model, messages) {
            const latest = [...messages].reverse().find(message => message.role === 'user');
            const query = String(latest?.content || '').trim();
            if (!query) return null;
            const { data, status } = await axios.get('https://prexzyapis.com/ai/ch', {
                params: { q: query },
                timeout: TIMEOUT_MS,
                headers: { Accept: 'application/json' },
                validateStatus: () => true,
            });
            if (status < 200 || status >= 300) {
                const error = new Error(`HTTP ${status}`);
                error.status = status;
                throw error;
            }
            if (data?.status !== true) throw new Error(data?.message || 'Prexzy returned an unsuccessful response');
            const text = data?.response;
            return text && String(text).trim() ? String(text).trim() : null;
        },
    };
}

// Pollinations — KEYLESS final fallback.
function pollinationsProvider() {
    return {
        name: 'pollinations',
        key: 'keyless',
        models: ['openai'],
        async call(_model, messages) {
            const { data, status } = await axios.post('https://text.pollinations.ai/openai', {
                model: 'openai',
                messages,
            }, {
                timeout: TIMEOUT_MS,
                headers: { 'Content-Type': 'application/json' },
                validateStatus: () => true,
            });
            if (status < 200 || status >= 300) {
                const error = new Error(`HTTP ${status}`);
                error.status = status;
                throw error;
            }
            const txt = typeof data === 'string'
                ? data
                : data?.choices?.[0]?.message?.content;
            return (txt && String(txt).trim()) || null;
        },
    };
}

/**
 * Build the ordered provider chain based on the managed CONFIG block and
 * whatever keys are present in the environment. Deduped by provider name.
 */
function buildChain() {
    const chain = [];
    const seen = new Set();
    const add = (p) => { if (p && !seen.has(p.name)) { seen.add(p.name); chain.push(p); } };

    // 1) The provider explicitly chosen via .chatbotapi (if it has a key).
    //    This is the PRIMARY fast path — Groq's 8B-instant model returns in
    //    ~1s. We intentionally do NOT put the Vercel AI Gateway first: it
    //    returns HTTP 403 unless a credit card is on file, and a guaranteed
    //    failed request at the front of the chain only makes every reply
    //    slower. The gateway is added lower down as a fallback instead.
    if (AI_API_KEY) {
        if (AI_PROVIDER === 'gemini') {
            add(geminiProvider(AI_API_KEY));
        } else {
            add(openAICompatible({ name: AI_PROVIDER, url: AI_URL, key: AI_API_KEY, models: AI_MODELS }));
        }
    }

    // 2) Any provider configured through environment variables.
    if (process.env.GROQ_API_KEY) add(openAICompatible({
        name: 'groq',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: process.env.GROQ_API_KEY,
        models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
    }));
    if (process.env.GEMINI_API_KEY) add(geminiProvider(process.env.GEMINI_API_KEY));
    if (process.env.OPENAI_API_KEY) add(openAICompatible({
        name: 'openai',
        url: 'https://api.openai.com/v1/chat/completions',
        key: process.env.OPENAI_API_KEY,
        models: ['gpt-4o-mini', 'gpt-3.5-turbo'],
    }));
    if (process.env.OPENROUTER_API_KEY) add(openAICompatible({
        name: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: process.env.OPENROUTER_API_KEY,
        models: ['openrouter/auto', 'openrouter/free', 'meta-llama/llama-3.3-70b-instruct'],
    }));
    // Vercel AI Gateway as a FALLBACK (only reached if the fast providers
    // above all fail). Uses VERCEL_AI_GATEWAY_KEY or AI_GATEWAY_API_KEY.
    // Note: the gateway requires a valid credit card on the Vercel account —
    // without one it returns HTTP 403 and this step is simply skipped over.
    if (GATEWAY_KEY) add(openAICompatible({
        name: 'gateway',
        url: 'https://ai-gateway.vercel.sh/v1/chat/completions',
        key: GATEWAY_KEY,
        models: ['groq/llama-3.1-8b-instant', 'openai/gpt-4o-mini'],
    }));

    // 3) Prexzy is the default when no user API key has been configured.
    //    It is also a safe fallback if a configured provider is temporarily down.
    add(prexzyProvider());

    // Optional OpenRouter fallback. Never embed a live key in source.
    if (process.env.OPENROUTER_NEURO_API_KEY) add(openAICompatible({
        name: 'openrouter-neuro',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: process.env.OPENROUTER_NEURO_API_KEY,
        models: ['meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.0-flash-exp:free'],
    }));

    // Final keyless backup so AI never fully dies.
    add(pollinationsProvider());

    return chain;
}

/* ------------------------------------------------------------------ *
 * Conversation memory
 * ------------------------------------------------------------------ */
const memory = new Map();

function _hist(key) { if (!memory.has(key)) memory.set(key, []); return memory.get(key); }
function clearMemory(key) { if (key) memory.delete(key); else memory.clear(); }

// Keep casual chatbot replies short and natural without affecting other AI features.
function compactChatReply(text, { maxChars = 320, maxSentences = 3 } = {}) {
    if (!text) return null;
    let reply = String(text).replace(/\s+/g, ' ').trim();
    if (!reply) return null;

    const sentences = reply.match(/[^.!?]+[.!?]+(?:["'”’)]*)|[^.!?]+$/g) || [reply];
    if (sentences.length > maxSentences) {
        reply = sentences.slice(0, maxSentences).join(' ').trim();
    }
    if (reply.length > maxChars) {
        const short = reply.slice(0, maxChars - 1).replace(/\s+\S*$/, '').trim();
        reply = short ? `${short}…` : `${reply.slice(0, maxChars - 1)}…`;
    }
    return reply;
}

function pushTurn(key, role, text) {
    if (!key || !text) return;
    const h = _hist(key);
    h.push({ role, content: String(text).slice(0, 1500) });
    while (h.length > MAX_TURNS * 2) h.shift();
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Ask the AI. Walks the provider chain and every model within a provider
 * until one returns a usable reply. Returns a string, or null if the whole
 * chain failed.
 */
async function ask({ key, system = '', user, remember = true, compact = false }) {
    if (!user || !String(user).trim()) return null;
    lastProviderError = null;
    lastProviderFailures = [];
    const userText = String(user).trim();

    const history = key ? _hist(key).slice() : [];
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    for (const t of history) messages.push({ role: t.role, content: t.content });
    messages.push({ role: 'user', content: userText });

    let reply = null;
    const chain = buildChain();

    outer:
    for (const provider of chain) {
        for (const model of provider.models) {
            try {
                reply = await provider.call(model, messages);
                if (reply) break outer;
            } catch (e) {
                const failure = {
                    provider: provider.name,
                    model,
                    status: Number.isInteger(e.status) ? e.status : undefined,
                    code: e.code || undefined,
                    message: String(e.message || e),
                };
                lastProviderFailures.push(failure);
                if (!lastProviderError || provider.name === AI_PROVIDER) lastProviderError = failure;
                console.error('[AI]', provider.name, model, e.message);
            }
        }
    }

    if (reply && compact) reply = compactChatReply(reply);

    if (reply && remember && key) {
        pushTurn(key, 'user', userText);
        pushTurn(key, 'assistant', reply);
    }
    return reply;
}

/**
 * Ask configured vision-capable providers about one or more image data URLs.
 * Text-only keyless providers are skipped because they cannot inspect media.
 */
async function askMultimodal({ key, system = '', user, media = [], remember = true, compact = false }) {
    if (!user || !String(user).trim() || !Array.isArray(media) || !media.length) return null;
    lastProviderError = null;
    lastProviderFailures = [];
    const userText = String(user).trim();
    const history = key ? _hist(key).slice() : [];
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    for (const t of history) messages.push({ role: t.role, content: t.content });
    messages.push({
        role: 'user',
        content: [
            { type: 'text', text: userText },
            ...media.map(item => ({ type: 'image_url', image_url: { url: item } })),
        ],
    });

    let reply = null;
    outer:
    for (const provider of buildChain()) {
        if (!provider.supportsVision) continue;
        for (const model of provider.models) {
            try {
                reply = await provider.call(model, messages);
                if (reply) break outer;
            } catch (e) {
                const failure = { provider: provider.name, model, status: Number.isInteger(e.status) ? e.status : undefined, code: e.code || undefined, message: String(e.message || e) };
                lastProviderFailures.push(failure);
                if (!lastProviderError || provider.name === AI_PROVIDER) lastProviderError = failure;
                console.error('[AI:vision]', provider.name, model, e.message);
            }
        }
    }
    if (reply && compact) reply = compactChatReply(reply);
    if (reply && remember && key) {
        pushTurn(key, 'user', userText);
        pushTurn(key, 'assistant', reply);
    }
    return reply;
}

/** Generate a detailed text-to-image result through Agnes Image 2.5 Flash. */
async function generateImage(prompt, { width = 1024, height = 1024, size, ratio } = {}) {
    if (!prompt || !String(prompt).trim()) return null;
    const apiKey = getAgnesApiKey();
    if (!apiKey) return null;
    const w = Math.max(1, Number(width) || 1024);
    const h = Math.max(1, Number(height) || 1024);
    const aspect = w / h;
    const outputRatio = ratio || (aspect > 1.7 ? '16:9' : aspect > 1.25 ? '3:2' : aspect > 1.05 ? '4:3' : aspect < 0.65 ? '9:16' : aspect < 0.85 ? '3:4' : '1:1');
    const outputSize = size || (Math.max(w, h) >= 1600 ? '2K' : '1K');
    try {
        const res = await axios.post('https://apihub.agnes-ai.com/v1/images/generations', {
            model: 'agnes-image-2.5-flash',
            prompt: String(prompt).trim(),
            size: outputSize,
            ratio: outputRatio,
            return_base64: true,
        }, {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 240000,
            validateStatus: () => true,
        });
        if (res.status < 200 || res.status >= 300) {
            console.error('[AI:image] Agnes returned HTTP', res.status);
            return null;
        }
        const payload = res.data || {};
        const item = payload.data?.[0] || payload.images?.[0] || payload.result?.[0] || payload.result || payload;
        const itemText = typeof item === 'string' ? item : '';
        const encoded = item?.b64_json || item?.base64 || item?.image_base64 || payload.b64_json || payload.base64 ||
            (itemText && !/^https?:\/\//i.test(itemText) ? itemText : null);
        let buf = null;
        if (typeof encoded === 'string') {
            buf = Buffer.from(encoded.replace(/^data:[^;]+;base64,/i, ''), 'base64');
        } else {
            const imageUrl = (itemText && /^https?:\/\//i.test(itemText) ? itemText : null) || item?.url || item?.image_url || payload.url || payload.image_url;
            if (typeof imageUrl === 'string' && /^https?:\/\//i.test(imageUrl)) {
                const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
                buf = Buffer.from(imageRes.data);
            }
        }
        if (!buf || buf.length < 1024) return null;
        return buf;
    } catch (e) {
        console.error('[AI:image] Agnes image request failed:', e.response?.status || e.message);
        return null;
    }
}

// Internal-only accessor: returns the existing Agnes credential without logging it.
function getAgnesApiKey() {
    return String(AGNES_API_KEY_FILE || process.env.AGNES_API_KEY || '').trim();
}

function getLastAIError() {
    return lastProviderError ? { ...lastProviderError } : null;
}

function getAIStatus() {
    return {
        primary: AI_PROVIDER,
        configured: Boolean(AI_API_KEY),
        model: AI_MODELS[0],
        chain: buildChain().map(provider => provider.name),
        lastError: getLastAIError(),
        failures: lastProviderFailures.map(failure => ({ ...failure })),
    };
}

function getProviderInfo() {
    const chain = buildChain();
    return {
        provider: AI_PROVIDER,
        key: AI_API_KEY ? 'configured' : '',
        url: AI_URL,
        models: AI_MODELS,
        chain: chain.map(p => p.name),
    };
}

module.exports = { ask, askMultimodal, generateImage, getAgnesApiKey, pushTurn, clearMemory, compactChatReply, getProviderInfo, getLastAIError, getAIStatus };

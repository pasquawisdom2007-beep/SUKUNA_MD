/**
 * chatbotImageGen — shared helper used by the DM chatbot and the group chatbot
 * to detect image-generation intent in a user's message and (if matched) send
 * a generated image. Uses the shared Agnes Image generator from smartAI.
 */
const { generateImage } = require('./smartAI');

// Match common "make me an image" style phrasings and capture the subject.
const TRIGGERS = [
    /(?:generate|create|make|draw|design|render|produce|give\s*me)\s+(?:an?\s+)?((?:(?:photorealistic|hyperrealistic|realistic|real|futuristic|cyberpunk|cinematic|surreal|anime)\s+)+(?:image|picture|pic|photo|portrait|art|drawing|illustration|painting)\s+(?:of|about|showing|with|for)\s+.+)/i,
    /(?:generate|create|make|draw|design|render|produce|give\s*me)\s+(?:an?\s+|me\s+(?:an?\s+)?)?(?:image|picture|pic|photo|portrait|art|drawing|illustration|painting)\s+(?:of|about|showing|with|for)\s+(.+)/i,
    /(?:image|picture|pic|photo)\s+of\s+(.+)/i,
    /(?:draw|paint|sketch)\s+(?:me\s+)?(.+)/i,
];

function detectImagePrompt(text) {
    if (!text || typeof text !== 'string') return null;
    const t = text.trim();
    for (const re of TRIGGERS) {
        const m = t.match(re);
        if (m && m[1]) {
            const p = m[1].trim().replace(/[.!?]+$/, '');
            if (p.length >= 2 && p.length <= 400) return p;
        }
    }
    return null;
}

async function generateImageBuffer(prompt) {
    try {
        const buffer = await generateImage(prompt);
        if (!buffer || buffer.length < 1024) return null;
        return { buffer, model: 'Agnes Image 2.5 Flash' };
    } catch (_) { return null; }
}

/**
 * If `text` looks like an image-gen request, generate and send it. Returns
 * true when handled (caller should skip the normal AI text reply).
 */
async function maybeSendGeneratedImage({ sock, from, msg, text }) {
    const prompt = detectImagePrompt(text);
    if (!prompt) return false;
    try {
        const out = await generateImageBuffer(prompt);
        if (!out) {
            await sock.sendMessage(from, { text: '🎨 I tried to draw that but the image servers refused. Try rewording it?' }, { quoted: msg });
            return true;
        }
        await sock.sendMessage(from, {
            image: out.buffer,
            caption: `🎨 Here you go — _${prompt}_`,
        }, { quoted: msg });
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = { detectImagePrompt, generateImageBuffer, maybeSendGeneratedImage };

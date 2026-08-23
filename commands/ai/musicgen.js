'use strict';

const MAX_PROMPT = 500;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const COOLDOWN_MS = 60 * 1000;
const cooldowns = new Map();

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
        },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.detail || payload.error || `Replicate returned HTTP ${response.status}`);
    }
    return payload;
}

async function pollPrediction(prediction, token) {
    let current = prediction;
    const pollUrl = current.urls?.get || `https://api.replicate.com/v1/predictions/${current.id}`;
    for (let attempt = 0; attempt < 50; attempt++) {
        if (current.status === 'succeeded') return current;
        if (['failed', 'canceled'].includes(current.status)) {
            throw new Error(current.error || `generation ${current.status}`);
        }
        await wait(3000);
        current = await requestJson(pollUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });
    }
    throw new Error('music generation timed out after 150 seconds');
}

function outputUrl(output) {
    if (typeof output === 'string') return output;
    if (Array.isArray(output)) return output.find(item => typeof item === 'string') || '';
    if (output && typeof output.url === 'string') return output.url;
    return '';
}

module.exports = {
    name: 'musicgen',
    aliases: ['music', 'makemusic', 'songgen'],
    description: 'Generate an original music clip from a text prompt',
    category: 'ai',

    async execute({ reply, args, sender, sock, from, prefix = '.' }) {
        const commandPrefix = prefix || '.';
        const token = process.env.REPLICATE_API_TOKEN || '';
        if (!token) {
            return reply('⚙️ Music generation is not configured. Add `REPLICATE_API_TOKEN` to the panel environment and restart the bot.');
        }

        const prompt = args.filter(arg => !/^--(duration|format|model)=/i.test(arg)).join(' ').trim();
        if (!prompt) {
            return reply(`🎵 Usage: \`${commandPrefix}musicgen <description>\`\nExample: \`${commandPrefix}musicgen a dark cinematic villain theme with choir and heavy drums\``);
        }
        if (prompt.length > MAX_PROMPT) {
            return reply(`❌ Prompt is too long. Keep it under ${MAX_PROMPT} characters.`);
        }

        const userKey = String(sender || from || 'unknown');
        const remaining = (cooldowns.get(userKey) || 0) - Date.now();
        if (remaining > 0) {
            return reply(`⏳ Please wait ${Math.ceil(remaining / 1000)} seconds before generating another track.`);
        }
        cooldowns.set(userKey, Date.now() + COOLDOWN_MS);

        const durationArg = args.find(arg => /^--duration=/i.test(arg));
        const modelArg = args.find(arg => /^--model=/i.test(arg));
        const duration = Math.min(60, Math.max(1, Number(durationArg?.split('=')[1]) || 30));
        const modelVersion = ['melody', 'large'].includes(modelArg?.split('=')[1]) ? modelArg.split('=')[1] : 'melody';

        try {
            const prediction = await requestJson('https://api.replicate.com/v1/models/meta/musicgen/predictions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Prefer: 'wait=1',
                },
                body: JSON.stringify({
                    input: {
                        prompt,
                        duration,
                        model_version: modelVersion,
                        output_format: 'mp3',
                    },
                }),
            });
            const completed = await pollPrediction(prediction, token);
            const audioUrl = outputUrl(completed.output);
            if (!audioUrl) throw new Error('provider returned no audio file');

            const audioResponse = await fetch(audioUrl, { headers: { 'User-Agent': 'SUKUNA-MD/3.0' } });
            if (!audioResponse.ok) throw new Error(`audio download returned HTTP ${audioResponse.status}`);
            const audio = Buffer.from(await audioResponse.arrayBuffer());
            if (!audio.length) throw new Error('provider returned an empty audio file');
            if (audio.length > MAX_AUDIO_BYTES) throw new Error('generated audio is larger than the 20 MB WhatsApp limit');

            return sock.sendMessage(from, {
                audio,
                mimetype: 'audio/mpeg',
                fileName: 'sukuna-musicgen.mp3',
                ptt: false,
                caption: `🎵 *Music generated*\n\n_${prompt}_\n\nDuration: ${duration}s · Model: ${modelVersion}`,
            });
        } catch (error) {
            cooldowns.delete(userKey);
            console.error('[MUSICGEN]', error.message);
            return reply(`❌ Music generation failed: ${error.message}`);
        }
    },
};

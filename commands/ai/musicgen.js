'use strict';

const crypto = require('crypto');
const { spawn } = require('child_process');

const MAX_PROMPT = 500;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const COOLDOWN_MS = 60 * 1000;
const FREE_SPACE = (process.env.MUSICGEN_HF_SPACE_URL || 'https://facebook-musicgen.hf.space').replace(/\/$/, '');
const FREE_API_PREFIX = process.env.MUSICGEN_HF_API_PREFIX || '/gradio_api';
const FREE_API_NAME = process.env.MUSICGEN_HF_API_NAME || 'predict_batched';
const FREE_TIMEOUT_MS = 150 * 1000;
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
        throw new Error(payload.detail || payload.error || `provider returned HTTP ${response.status}`);
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

function parseServerSentEvents(body) {
    let lastValue;
    for (const block of String(body).split(/\r?\n\r?\n/)) {
        const event = block.match(/^event:\s*([^\r\n]+)$/m)?.[1]?.trim();
        const data = block
            .split(/\r?\n/)
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart())
            .join('\n');
        if (!data) continue;

        let value;
        try {
            value = JSON.parse(data);
        } catch {
            value = data;
        }
        if (event === 'error') {
            const message = typeof value === 'string' ? value : value?.message || value?.error;
            throw new Error(message || 'free MusicGen Space returned an error');
        }
        lastValue = value;
        if (event === 'complete' || event === 'completed') return value;
    }
    if (lastValue !== undefined) return lastValue;
    throw new Error('free MusicGen Space returned no completion event');
}

function findHostedFile(value, baseUrl) {
    if (typeof value === 'string') {
        if (/^https?:\/\//i.test(value)) return value;
        if (value.startsWith('/') && !value.startsWith('/tmp/')) {
            return new URL(value, baseUrl).toString();
        }
        return '';
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findHostedFile(item, baseUrl);
            if (found) return found;
        }
        return '';
    }
    if (value && typeof value === 'object') {
        for (const key of ['url', 'data', 'path', 'value']) {
            const found = findHostedFile(value[key], baseUrl);
            if (found) return found;
        }
    }
    return '';
}

async function generateWithFreeSpace(prompt) {
    const sessionHash = crypto.randomBytes(12).toString('hex');
    const apiUrl = `${FREE_SPACE}${FREE_API_PREFIX}/call/${FREE_API_NAME}`;
    const queued = await requestJson(apiUrl, {
        method: 'POST',
        body: JSON.stringify({
            data: [prompt, null],
            session_hash: sessionHash,
        }),
        signal: AbortSignal.timeout(30 * 1000),
    });
    const eventId = queued.event_id || queued.id;
    if (!eventId) throw new Error('free MusicGen Space did not return a queue event');

    const eventsUrl = `${apiUrl}/${encodeURIComponent(eventId)}`;
    const response = await fetch(eventsUrl, {
        headers: { Accept: 'text/event-stream' },
        signal: AbortSignal.timeout(FREE_TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`free MusicGen Space returned HTTP ${response.status}`);
    const completed = response.headers.get('content-type')?.includes('application/json')
        ? JSON.parse(body)
        : parseServerSentEvents(body);
    const audioUrl = findHostedFile(completed, FREE_SPACE);
    if (!audioUrl) throw new Error('free MusicGen Space returned no audio file');
    return { audioUrl, provider: 'Hugging Face MusicGen Space', model: 'facebook/MusicGen' };
}

async function generateWithReplicate(prompt, duration, modelVersion, token) {
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
    if (!audioUrl) throw new Error('Replicate returned no audio file');
    return { audioUrl, provider: 'Replicate', model: modelVersion };
}

function convertToMp3(input) {
    return new Promise(resolve => {
        let ffmpegPath;
        try {
            ffmpegPath = require('ffmpeg-static');
        } catch {
            return resolve(null);
        }
        const ffmpeg = spawn(ffmpegPath, [
            '-hide_banner', '-loglevel', 'error',
            '-i', 'pipe:0',
            '-vn', '-c:a', 'libmp3lame', '-b:a', '128k',
            '-f', 'mp3', 'pipe:1',
        ]);
        const chunks = [];
        ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
        ffmpeg.on('error', () => resolve(null));
        ffmpeg.on('close', code => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
        ffmpeg.stdin.on('error', () => {});
        ffmpeg.stdin.end(input);
    });
}

async function downloadAudio(audioUrl) {
    const response = await fetch(audioUrl, {
        headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
        signal: AbortSignal.timeout(60 * 1000),
    });
    if (!response.ok) throw new Error(`audio download returned HTTP ${response.status}`);
    const raw = Buffer.from(await response.arrayBuffer());
    if (!raw.length) throw new Error('provider returned an empty audio file');
    if (raw.length > MAX_AUDIO_BYTES) throw new Error('generated audio is larger than the 20 MB WhatsApp limit');

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('audio/wav') || contentType.includes('audio/x-wav')) {
        const mp3 = await convertToMp3(raw);
        if (mp3?.length && mp3.length <= MAX_AUDIO_BYTES) {
            return { buffer: mp3, mimetype: 'audio/mpeg', extension: 'mp3' };
        }
        return { buffer: raw, mimetype: 'audio/wav', extension: 'wav' };
    }
    if (contentType.includes('audio/ogg')) return { buffer: raw, mimetype: 'audio/ogg', extension: 'ogg' };
    if (contentType.includes('audio/mp4')) return { buffer: raw, mimetype: 'audio/mp4', extension: 'm4a' };
    return { buffer: raw, mimetype: 'audio/mpeg', extension: 'mp3' };
}

module.exports = {
    name: 'musicgen',
    aliases: ['music', 'makemusic', 'songgen'],
    description: 'Generate a music clip using the free Hugging Face MusicGen Space',
    category: 'ai',

    async execute({ reply, args, sender, sock, from, prefix = '.' }) {
        const commandPrefix = prefix || '.';
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
        const replicateToken = process.env.REPLICATE_API_TOKEN || '';

        try {
            let generated;
            try {
                generated = await generateWithFreeSpace(prompt);
            } catch (freeError) {
                if (!replicateToken) throw new Error(`free MusicGen Space unavailable: ${freeError.message}`);
                console.warn('[MUSICGEN] Free Space failed; trying optional Replicate fallback:', freeError.message);
                generated = await generateWithReplicate(prompt, duration, modelVersion, replicateToken);
            }

            const audio = await downloadAudio(generated.audioUrl);
            return sock.sendMessage(from, {
                audio: audio.buffer,
                mimetype: audio.mimetype,
                fileName: `sukuna-musicgen.${audio.extension}`,
                ptt: false,
                caption: `🎵 *Music generated*\n\n_${prompt}_\n\nProvider: ${generated.provider}${generated.model ? ` · Model: ${generated.model}` : ''}${generated.provider === 'Hugging Face MusicGen Space' ? '\n_Free public endpoint; clip length follows the Space defaults._' : `\nDuration: ${duration}s`}`,
            });
        } catch (error) {
            cooldowns.delete(userKey);
            console.error('[MUSICGEN]', error.message);
            return reply(`❌ Music generation failed: ${error.message}`);
        }
    },
};

'use strict';

/**
 * Cartesia Sonic voice helper for WhatsApp.
 *
 * The API key is intentionally read from CARTESIA_API_KEY only; never put a
 * Cartesia secret in this repository. Cartesia returns MP3, so voice notes are
 * transcoded to OGG/Opus for WhatsApp's native PTT bubble.
 */
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

const CARTESIA_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_VERSION = '2026-08-14';
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID || 'ef191366-f52f-447a-a398-ed8c0f2943a1';
const CARTESIA_MODEL = process.env.CARTESIA_MODEL || 'sonic-3.6';
const MAX_TTS_CHARS = 1200;

// Kept as a compatibility fallback when a deployment has not configured
// CARTESIA_API_KEY yet. Once the key is configured, Cartesia is always primary.
const LEGACY_BASE = 'https://apis.prexzyvilla.site';
const LEGACY_VOICE_MAP = {
    Leda: ['/tts/olivia', '/tts/sophia', '/tts/emma', '/tts/tts-en'],
    Charon: ['/tts/marcus', '/tts/ethan', '/tts/jackson', '/tts/tts-en'],
};

let configuredFfmpeg = null;
try { configuredFfmpeg = require('ffmpeg-static'); } catch (_) {}

function ffmpegExecutable() {
    return configuredFfmpeg && fs.existsSync(configuredFfmpeg) ? configuredFfmpeg : (process.env.FFMPEG_PATH || 'ffmpeg');
}

/** Convert text laughter markers into Cartesia's actual nonverbal laughter. */
function prepareVoiceTranscript(text) {
    let value = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
    if (!value) return '';
    value = value
        .replace(/\[(?:laugh|laughs|laughter|chuckle)\]/gi, '[laughter]')
        .replace(/\((?:laugh(?:s|ing)?|chuckle(?:s|ing)?)\)/gi, '[laughter]')
        .replace(/\b(?:lmao|lmfao|rofl|lol+|haha+|hehe+)\b/gi, '[laughter]')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_~`]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return value;
}

/** Remove internal voice markers before sending a text-only response. */
function stripVoiceMarkers(text) {
    return String(text || '')
        .replace(/\[(?:laughter|laugh|laughs|chuckle)\]/gi, '')
        .replace(/\((?:laugh(?:s|ing)?|chuckle(?:s|ing)?)\)/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function hasCartesiaKey() {
    return Boolean(String(process.env.CARTESIA_API_KEY || '').trim());
}

async function fetchCartesiaMp3(text) {
    const apiKey = String(process.env.CARTESIA_API_KEY || '').trim();
    if (!apiKey || !text) return null;
    const response = await fetch(CARTESIA_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Cartesia-Version': CARTESIA_VERSION,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
            model_id: CARTESIA_MODEL,
            transcript: text,
            voice: { id: CARTESIA_VOICE_ID },
            language: process.env.CARTESIA_LANGUAGE || 'en',
            output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
            generation_config: {
                // Let Sonic follow the transcript naturally; use happy guidance
                // only when the transcript contains a real laughter cue.
                ...(text.includes('[laughter]') ? { emotion: 'happy' } : {}),
                speed: 1.0,
                volume: 1.0,
            },
        }),
        signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 240);
        throw new Error(`Cartesia HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1024) throw new Error('Cartesia returned empty audio');
    return buffer;
}

function transcodeMp3ToOpus(mp3Buffer) {
    return new Promise((resolve) => {
        const args = [
            '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn',
            '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '1',
            '-f', 'ogg', 'pipe:1',
        ];
        const ff = spawn(ffmpegExecutable(), args);
        const chunks = [];
        ff.stdout.on('data', chunk => chunks.push(chunk));
        ff.on('error', () => resolve(null));
        ff.on('close', code => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
        ff.stdin.on('error', () => {});
        ff.stdin.end(mp3Buffer);
    });
}

async function fetchLegacyMp3(endpoint, text) {
    try {
        const response = await axios.get(`${LEGACY_BASE}${endpoint}?text=${encodeURIComponent(text)}`, {
            responseType: 'arraybuffer', timeout: 35000,
            validateStatus: status => status >= 200 && status < 500,
        });
        const type = String(response.headers['content-type'] || '');
        if (response.status !== 200 || (!type.includes('audio') && !type.includes('octet-stream') && !type.includes('mpeg'))) return null;
        const buffer = Buffer.from(response.data);
        return buffer.length >= 1024 ? buffer : null;
    } catch (error) {
        console.error('[TTS legacy]', endpoint, error.message);
        return null;
    }
}

async function generateVoice(text, voiceName = 'Leda') {
    const transcript = prepareVoiceTranscript(text);
    if (!transcript) return null;

    let mp3 = null;
    if (hasCartesiaKey()) {
        try {
            mp3 = await fetchCartesiaMp3(transcript);
        } catch (error) {
            console.error('[TTS Cartesia]', error.message);
        }
    }
    if (!mp3) {
        const candidates = LEGACY_VOICE_MAP[voiceName] || LEGACY_VOICE_MAP.Leda;
        for (const endpoint of candidates) {
            mp3 = await fetchLegacyMp3(endpoint, transcript);
            if (mp3) break;
        }
    }
    if (!mp3) return null;

    const opus = await transcodeMp3ToOpus(mp3);
    return opus?.length
        ? { buffer: opus, mimetype: 'audio/ogg; codecs=opus' }
        : { buffer: mp3, mimetype: 'audio/mpeg' };
}

module.exports = {
    generateVoice,
    prepareVoiceTranscript,
    stripVoiceMarkers,
    hasCartesiaKey,
    CARTESIA_VOICE_ID,
};

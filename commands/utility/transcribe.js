'use strict';

const config = require('../../config');
const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

const MAX_BYTES = 25 * 1024 * 1024;

function unwrap(message) {
    return message?.ephemeralMessage?.message
        || message?.viewOnceMessage?.message
        || message?.viewOnceMessageV2?.message
        || message
        || {};
}

function findAudio(message) {
    const unwrapped = unwrap(message);
    return unwrapped.audioMessage || null;
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

module.exports = {
    name: 'transcribe',
    aliases: ['stt', 'voice2text', 'voicetotext'],
    description: 'Transcribe a replied-to or attached voice note into text',
    category: 'utility',

    async execute({ sock, msg, from, reply }) {
        const apiKey = process.env.OPENAI_API_KEY || config.apiKeys?.openai || '';
        if (!apiKey) {
            return reply('⚙️ Transcription is not configured. Add `OPENAI_API_KEY` to the panel environment and restart the bot.');
        }

        const current = unwrap(msg.message);
        const context = current.extendedTextMessage?.contextInfo
            || current.imageMessage?.contextInfo
            || current.videoMessage?.contextInfo
            || current.audioMessage?.contextInfo
            || {};
        const audioNode = findAudio(context.quotedMessage) || findAudio(msg.message);
        if (!audioNode) {
            return reply('🎙️ Reply to a voice note or attach one with `.transcribe`.');
        }

        try {
            const stream = await downloadContentFromMessage(audioNode, 'audio');
            const buffer = await streamToBuffer(stream);
            if (!buffer.length) throw new Error('the voice note was empty');
            if (buffer.length > MAX_BYTES) throw new Error('the voice note is larger than the 25 MB API limit');

            const mime = String(audioNode.mimetype || 'audio/ogg').split(';')[0];
            const extension = mime.includes('wav') ? 'wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : 'ogg';
            const form = new FormData();
            form.append('file', new Blob([buffer], { type: mime }), `voice.${extension}`);
            form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe');

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}` },
                body: form,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error?.message || `OpenAI returned HTTP ${response.status}`);
            }

            const text = String(payload.text || '').trim();
            if (!text) return reply('🎙️ The transcription service returned no spoken text.');
            const clipped = text.length > 6000 ? `${text.slice(0, 6000)}\n…(transcript truncated)` : text;
            return reply(`📝 *Transcript*\n\n${clipped}`);
        } catch (error) {
            console.error('[TRANSCRIBE]', error.message);
            return reply(`❌ Transcription failed: ${error.message}`);
        }
    },
};

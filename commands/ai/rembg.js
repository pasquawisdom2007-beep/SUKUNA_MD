/**
 * Remove Background Command
 * Usage: .rembg (reply to an image) or .rembg <image URL>
 *
 * Reply handling intentionally follows Baileys' message shape. The command
 * dispatcher passes the raw incoming message, so `quoted.download()` is not
 * available here; the quoted media must be downloaded with downloadMediaMessage.
 */

const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@pasqua-baileys/baileys');
const config = require('../../config');
const { isUrl } = require('../../lib/mediaFetch');

const REMOVEBG_API_KEY = process.env.REMOVEBG_API_KEY || config.apiKeys?.removebg || '';
const REMOVE_BG_URL = 'https://api.remove.bg/v1.0/removebg';

function unwrapMessage(message) {
    let current = message;
    for (let i = 0; i < 6 && current; i += 1) {
        if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
        else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
        else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
        else break;
    }
    return current || null;
}

function getQuotedContext(msg) {
    const message = msg?.message || {};
    return (
        message.extendedTextMessage?.contextInfo ||
        message.imageMessage?.contextInfo ||
        message.videoMessage?.contextInfo ||
        message.documentMessage?.contextInfo ||
        null
    );
}

function getQuotedMedia(msg) {
    const contextInfo = getQuotedContext(msg);
    const quotedMessage = unwrapMessage(contextInfo?.quotedMessage);
    if (!quotedMessage) return { contextInfo, quotedMessage: null, mediaType: null, mediaMessage: null };

    if (quotedMessage.imageMessage) {
        return { contextInfo, quotedMessage, mediaType: 'image', mediaMessage: quotedMessage.imageMessage };
    }

    return { contextInfo, quotedMessage, mediaType: null, mediaMessage: null };
}

async function downloadQuotedImage(sock, from, msg, contextInfo, quotedMessage) {
    const targetMessage = {
        key: {
            remoteJid: from,
            id: contextInfo?.stanzaId,
            participant: contextInfo?.participant,
        },
        message: quotedMessage,
    };

    return downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
    );
}

async function removeBackground(imageBuffer, filename = 'image.png') {
    if (!REMOVEBG_API_KEY) {
        throw new Error('REMOVEBG_API_KEY is not configured. Add your remove.bg API key to the environment and try again.');
    }

    const form = new FormData();
    form.append('image_file', imageBuffer, { filename, contentType: 'image/*' });
    form.append('size', 'auto');
    form.append('format', 'png');

    const response = await axios.post(REMOVE_BG_URL, form, {
        headers: {
            ...form.getHeaders(),
            'X-Api-Key': REMOVEBG_API_KEY,
            Accept: 'image/png',
        },
        responseType: 'arraybuffer',
        timeout: 120000,
        validateStatus: () => true,
    });

    const output = Buffer.from(response.data || '');
    if (response.status < 200 || response.status >= 300 || output.length < 256) {
        let detail = '';
        try {
            const body = JSON.parse(output.toString('utf8'));
            detail = body?.errors?.map(item => item.title || item.detail).filter(Boolean).join(', ') || body?.error || '';
        } catch (_) {
            detail = output.toString('utf8').slice(0, 220);
        }
        throw new Error(`remove.bg returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    return output;
}

module.exports = {
    name: 'rembg',
    aliases: ['removebg', 'rbg'],
    description: 'Remove the background from a replied photo.',
    category: 'media',
    usage: '.rembg (reply to an image) or .rembg <image URL>',

    async execute({ sock, msg, from, reply, args = [], prefix }) {
        const px = prefix || '.';
        const { contextInfo, quotedMessage, mediaType, mediaMessage } = getQuotedMedia(msg);
        const sourceUrl = args[0] && isUrl(args[0]) ? args[0] : null;

        if (!mediaMessage && !sourceUrl) {
            return reply(
                '🖼️ *Remove Background*\n\n' +
                `Reply to a photo with ${px}rembg.\n` +
                `You can also use ${px}rembg <image URL>.`
            );
        }

        if (mediaMessage && mediaType !== 'image') {
            return reply('❌ Please reply to a photo. Video background removal is not supported by remove.bg.');
        }

        if (!REMOVEBG_API_KEY) {
            return reply('❌ REMOVEBG_API_KEY is not configured. Add your remove.bg API key to the environment, then try again.');
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
        await reply('⏳ *Removing background…*');

        try {
            let imageBuffer;
            let filename = 'image.png';

            if (mediaMessage) {
                imageBuffer = await downloadQuotedImage(sock, from, msg, contextInfo, quotedMessage);
                filename = mediaMessage.fileName || 'image.png';
            } else {
                const response = await axios.get(sourceUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
                });
                imageBuffer = Buffer.from(response.data || '');
            }

            if (!imageBuffer || imageBuffer.length < 256) {
                throw new Error('The replied photo could not be downloaded or is empty.');
            }

            const resultBuffer = await removeBackground(imageBuffer, filename);
            await sock.sendMessage(from, {
                image: resultBuffer,
                mimetype: 'image/png',
                caption: '🖼️ *Background Removed*\n\n🚀 Engine: remove.bg\n\n> Processed by SUKUNA MD',
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (error) {
            console.error('[rembg]', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply(`❌ *Background removal failed:* ${error.message}`);
        }
    },
};

/**
 * tovv — Convert a normal image / video / voice note into a view-once message.
 *
 * Usage:
 *   • Reply to an image/video/audio with .tovv
 *   • OR attach the media with caption .tovv
 *
 * The bot re-uploads the media and sends it with the view-once flag set,
 * so the recipient can only open it one time.
 */
'use strict';

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

const TIMEOUT_MS = 30_000;

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

function downloadWithTimeout(node, type) {
    return new Promise(async (resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Media download timed out')), TIMEOUT_MS);
        try {
            const stream = await downloadContentFromMessage(node, type);
            const buf = await streamToBuffer(stream);
            clearTimeout(t);
            resolve(buf);
        } catch (e) { clearTimeout(t); reject(e); }
    });
}

/** Pull the media node from either the quoted message or the current message. */
function resolveMedia(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo
             || msg.message?.imageMessage?.contextInfo
             || msg.message?.videoMessage?.contextInfo
             || msg.message?.audioMessage?.contextInfo
             || null;
    const quoted = ctx?.quotedMessage || null;

    const sources = [
        quoted,
        msg.message,
        // unwrap viewOnce / ephemeral wrappers if present
        quoted?.viewOnceMessage?.message,
        quoted?.viewOnceMessageV2?.message,
        quoted?.viewOnceMessageV2Extension?.message,
        quoted?.ephemeralMessage?.message,
        msg.message?.viewOnceMessage?.message,
        msg.message?.viewOnceMessageV2?.message,
        msg.message?.ephemeralMessage?.message,
    ].filter(Boolean);

    for (const src of sources) {
        if (src.imageMessage) return { type: 'image', node: src.imageMessage };
        if (src.videoMessage) return { type: 'video', node: src.videoMessage };
        if (src.audioMessage) return { type: 'audio', node: src.audioMessage };
    }
    return null;
}

module.exports = {
    name:        'tovv',
    aliases:     ['vv', 'viewonce', 'tovo'],
    description: 'Re-send an image / video / voice note as a view-once message',
    usage:       '.tovv (reply to media)',
    category:    'media',

    async execute({ sock, msg, from, args, reply }) {
        const found = resolveMedia(msg);

        if (!found) {
            return reply(
                '👁️ *To View-Once*\n\n' +
                'Reply to (or attach) an image, video, or voice note with:\n' +
                '`.tovv`\n\n' +
                'The bot will re-send it as a *view-once* message.'
            );
        }

        const { type, node } = found;
        const caption = args.join(' ').trim();

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        let buf;
        try {
            buf = await downloadWithTimeout(node, type);
            if (!buf || buf.length < 100) throw new Error('empty media buffer');
        } catch (e) {
            console.error('[tovv:download]', e.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply('❌ Could not download that media: ' + e.message);
        }

        try {
            const payload = { viewOnce: true };
            if (type === 'image') {
                payload.image    = buf;
                payload.mimetype = node.mimetype || 'image/jpeg';
                if (caption) payload.caption = caption;
            } else if (type === 'video') {
                payload.video    = buf;
                payload.mimetype = node.mimetype || 'video/mp4';
                if (caption) payload.caption = caption;
            } else { // audio
                payload.audio    = buf;
                payload.mimetype = node.mimetype || 'audio/ogg; codecs=opus';
                payload.ptt      = node.ptt !== false; // default to PTT
            }

            await sock.sendMessage(from, payload, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (e) {
            console.error('[tovv:send]', e.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return reply('❌ Failed to send view-once: ' + e.message);
        }
    },
};

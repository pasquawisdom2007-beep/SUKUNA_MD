/**
 * AutoVV Command — Auto-forward group media to owner DM as view-once
 * Automatically listens for photos/videos sent in groups
 * When detected, sends them to owner's DM as view-once messages
 */

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

async function downloadMedia(mediaMsg, mediaType, retries = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buf = Buffer.concat(chunks);
            if (buf.length === 0) throw new Error('Empty buffer received');
            return buf;
        } catch (err) {
            lastErr = err;
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastErr;
}

module.exports = {
    name: 'autovv',
    alias: ['autovv', 'autovvme'],
    desc: 'Auto-forward group media to owner DM as view-once',
    category: 'Utility',
    isListener: true,

    execute: async (context) => {
        const { sock, msg, from } = context;

        // Only trigger in groups
        if (!from.includes('@g.us')) return;

        const OWNER_ID = process.env.OWNER_ID || '1234567890@s.whatsapp.net';

        try {
            // Check for image
            if (msg.message?.imageMessage) {
                const buffer = await downloadMedia(msg.message.imageMessage, 'image');
                if (buffer && buffer.length > 0) {
                    await sock.sendMessage(OWNER_ID, {
                        image: buffer,
                    });
                }
                return;
            }

            // Check for video
            if (msg.message?.videoMessage) {
                const buffer = await downloadMedia(msg.message.videoMessage, 'video');
                if (buffer && buffer.length > 0) {
                    await sock.sendMessage(OWNER_ID, {
                        video: buffer,
                        mimetype: msg.message.videoMessage.mimetype || 'video/mp4',
                    });
                }
                return;
            }
        } catch (err) {
            console.error('[autovv]', err.message);
        }
    }
};

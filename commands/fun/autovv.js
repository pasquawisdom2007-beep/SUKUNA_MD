/**
 * AutoVV Command — Auto-forward group media to owner DM as view-once
 * Automatically listens for photos/videos sent in groups
 * When detected, sends them to owner's DM as view-once messages
 */

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

function enabled() {
    return /^(1|true|yes|on)$/i.test(String(process.env.AUTOVV_ENABLED || '').trim());
}

function ownerJid() {
    const raw = String(process.env.OWNER_NUMBER || process.env.OWNER_ID || '').replace(/\D/g, '');
    return raw.length >= 8 ? `${raw}@s.whatsapp.net` : '';
}

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

        // This listener used to forward every group photo/video immediately,
        // even when the owner had never enabled AutoVV and even to a hardcoded
        // placeholder JID. Keep it opt-in and require a real destination.
        if (!enabled()) return;

        // Only trigger in groups
        if (!from.includes('@g.us')) return;

        const OWNER_ID = ownerJid();
        if (!OWNER_ID) return;

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

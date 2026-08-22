/**
 * savestatus — Save a WhatsApp status to your own chat (Saved Messages).
 *
 * Usage:
 *   Reply to a status + .savestatus   → saves that status (image/video/audio/text)
 *                                       to the bot owner's own DM (Saved Messages).
 *   .savestatus on                    → enable AUTO-SAVE for every incoming status
 *   .savestatus off                   → disable auto-save
 *   .savestatus                       → show current state / usage
 *
 * Auto-save hook lives in lib/sessionManager.js (status@broadcast handler):
 * when database.getAutoSaveStatus(phoneNumber) is true, every received
 * status is forwarded into the bot owner's own chat.
 */

const database = require('../../utils/database');

const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

const TIMEOUT_MS = 30_000;

async function downloadMedia(mediaMsg, type) {
    return new Promise(async (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Download timed out')), TIMEOUT_MS);
        try {
            const stream = await downloadContentFromMessage(mediaMsg, type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            clearTimeout(timer);
            resolve(Buffer.concat(chunks));
        } catch (e) {
            clearTimeout(timer);
            reject(e);
        }
    });
}

/**
 * Save a status quoted-message object into `destJid`.
 * Returns a short label of what was saved.
 */
async function saveQuotedStatus(sock, destJid, quoted, ownerCaption = '') {
    if (quoted.imageMessage) {
        const buf = await downloadMedia(quoted.imageMessage, 'image');
        await sock.sendMessage(destJid, {
            image:   buf,
            caption: ownerCaption + (quoted.imageMessage.caption ? `\n\n${quoted.imageMessage.caption}` : ''),
        });
        return '📸 image';
    }
    if (quoted.videoMessage) {
        const buf = await downloadMedia(quoted.videoMessage, 'video');
        await sock.sendMessage(destJid, {
            video:   buf,
            caption: ownerCaption + (quoted.videoMessage.caption ? `\n\n${quoted.videoMessage.caption}` : ''),
        });
        return '🎥 video';
    }
    if (quoted.audioMessage) {
        const buf = await downloadMedia(quoted.audioMessage, 'audio');
        await sock.sendMessage(destJid, {
            audio:    buf,
            mimetype: quoted.audioMessage.mimetype || 'audio/ogg; codecs=opus',
            ptt:      !!quoted.audioMessage.ptt,
        });
        return '🎵 audio';
    }
    const text = quoted.extendedTextMessage?.text || quoted.conversation;
    if (text) {
        await sock.sendMessage(destJid, {
            text: (ownerCaption ? ownerCaption + '\n\n' : '') + text,
        });
        return '📝 text';
    }
    throw new Error('Unsupported status type');
}

module.exports = {
    name: 'savestatus',
    aliases: ['save', 'savesm', 'ss'],
    description: "Save a replied status to your own DM, or toggle auto-save",
    category: 'general',
    _saveQuotedStatus: saveQuotedStatus, // exported for sessionManager auto-save

    async execute({ sock, msg, args, reply, phoneNumber, isOwner }) {
        try {
            const sub = (args[0] || '').toLowerCase();

            // ── TOGGLE: .savestatus on / off / status ─────────────────────
            if (['on', 'off', 'enable', 'disable', 'status'].includes(sub)) {
                if (!isOwner) {
                    return reply('🛡️ *Owner Only!*\n\n❌ Only the bot owner can change auto-save settings.');
                }
                if (sub === 'status') {
                    const cur = database.getAutoSaveStatus(phoneNumber);
                    return reply(
                        `╔══════════════════════════╗\n` +
                        `║  💾 *AUTO-SAVE STATUS*    ║\n` +
                        `╚══════════════════════════╝\n\n` +
                        `Current state: *${cur ? '🟢 ON' : '🔴 OFF'}*\n\n` +
                        `Use *.savestatus on* or *.savestatus off* to toggle.`
                    );
                }
                const enable = (sub === 'on' || sub === 'enable');
                database.setAutoSaveStatus(phoneNumber, enable);
                return reply(
                    `╔══════════════════════════╗\n` +
                    `║  💾 *AUTO-SAVE STATUS*    ║\n` +
                    `╚══════════════════════════╝\n\n` +
                    `Auto-save is now: *${enable ? '🟢 ON' : '🔴 OFF'}*\n\n` +
                    (enable
                        ? `_Every incoming status will be saved to your own chat._`
                        : `_Statuses will no longer be auto-saved._`)
                );
            }

            // ── MANUAL: must be a reply ───────────────────────────────────
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = ctx?.quotedMessage;
            if (!quoted) {
                return reply(
                    `╔══════════════════════════╗\n` +
                    `║  💾 *SAVE STATUS*         ║\n` +
                    `╚══════════════════════════╝\n\n` +
                    `*Usage:*\n` +
                    `▸ Reply to a status + *.savestatus*\n` +
                    `▸ *.savestatus on* — auto-save every status\n` +
                    `▸ *.savestatus off* — disable auto-save\n` +
                    `▸ *.savestatus status* — show state`
                );
            }

            // Destination = bot's own JID (Saved Messages)
            const destJid = `${phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`;
            const fromUser = (ctx.participant || ctx.remoteJid || '').split('@')[0].split(':')[0];
            const header = `💾 *Saved Status*${fromUser ? ` from +${fromUser}` : ''}`;

            await reply('💾 _Saving status to your DM…_');
            const label = await saveQuotedStatus(sock, destJid, quoted, header);
            return reply(`✅ *Status saved!* (${label}) — check your own chat.`);
        } catch (err) {
            console.error('[SAVESTATUS]', err);
            return reply(`❌ Failed to save status: ${err.message}`);
        }
    },
};

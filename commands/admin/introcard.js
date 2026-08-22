'use strict';
const database     = require('../../utils/database');
const eventManager = require('../../lib/eventManager');
const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

// ── ffmpeg binary (prefer ffmpeg-static, fall back to system ffmpeg) ─────────
let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch (_) { FFMPEG = 'ffmpeg'; }

// Per-group intro videos live here.
const INTRO_DIR = path.resolve(__dirname, '..', '..', 'assets', 'introcards');

function safeId(groupId) {
    return String(groupId || '').replace(/[^a-z0-9]/gi, '_');
}
function introVideoPath(groupId) {
    return path.join(INTRO_DIR, `${safeId(groupId)}.mp4`);
}
function tmp(ext) {
    return path.join(os.tmpdir(), `introvid-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
}
function run(cmd, ms = 60000) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: ms, maxBuffer: 80 * 1024 * 1024 }, (err, _so, se) =>
            err ? reject(new Error(se || err.message)) : resolve()
        );
    });
}
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

/**
 * Normalise ANY input (video / gif / animated sticker) into a clean,
 * rectangle (16:9) MP4 suitable for a welcome video. The center of the
 * source is cropped to 16:9 then scaled to 640x360. Capped at 30s.
 */
async function toRectangleMp4(inputBuf, inExt) {
    const inP  = tmp(inExt || '.mp4');
    const outP = tmp('.mp4');
    fs.writeFileSync(inP, inputBuf);
    try {
        await run(
            `"${FFMPEG}" -y -i "${inP}" -t 30 -movflags +faststart ` +
            `-vf "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=640:360:flags=lanczos,format=yuv420p" ` +
            `-c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 24 ` +
            `-c:a aac -b:a 128k -shortest "${outP}"`
        );
        return fs.readFileSync(outP);
    } finally {
        try { fs.unlinkSync(inP); } catch {}
        try { fs.unlinkSync(outP); } catch {}
    }
}

module.exports = {
    name: 'introcard',
    aliases: ['intro', 'introset'],
    description: 'Beautiful intro card for new group members (with optional welcome video)',
    category: 'admin',

    async execute({ sock, msg, from, sender, reply, args, isGroup, isAdmin, isOwner, phoneNumber }) {
        if (!isGroup) return reply('❌ This command is for groups only.');
        if (!isOwner && !isAdmin) return reply('❌ Only admins (or the bot owner) can configure the intro card.');

        const sub = (args[0] || '').toLowerCase();

        // ── .introcard on/off ──────────────────────────────────────────────
        if (sub === 'on') {
            database.setGroup(from, 'introcard', true);
            const hasVid = fs.existsSync(introVideoPath(from));
            return reply(
                `╭─❒ ◈ 𝙎𝙐𝙆𝙐᳇𝘼 ❒\n` +
                `│ ✅ *Intro Card Enabled*\n` +
                `│ New members get a welcome ${hasVid ? 'video 🎬' : 'card 🖼️'} + short message.\n` +
                (hasVid ? '' : `│ 💡 Tip: reply to a video with *.introcard video* to attach a welcome clip.\n`) +
                `╰─⛧ 𝓹𝓪𝓼𝓺𝓪 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭`
            );
        }

        if (sub === 'off') {
            database.setGroup(from, 'introcard', false);
            return reply(
                `╭─❒ ◈ 𝙎𝙐𝙆𝙐᳇𝘼 ❒\n` +
                `│ ❌ *Intro Card Disabled*\n` +
                `╰─⛧ 𝓹𝓪𝓼𝓺𝓪 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭`
            );
        }

        // ── .introcard video ─ set the welcome video (reply/attach) ─────────
        if (sub === 'video' || sub === 'setvideo' || sub === 'vid') {
            const ctx    = msg.message?.extendedTextMessage?.contextInfo
                        || msg.message?.videoMessage?.contextInfo
                        || null;
            const quoted = ctx?.quotedMessage;

            const videoNode   = quoted?.videoMessage || msg.message?.videoMessage || null;
            const stickerNode = quoted?.stickerMessage || null;
            const gifNode     = (quoted?.videoMessage?.gifPlayback && quoted.videoMessage) || null;

            if (!videoNode && !stickerNode && !gifNode) {
                return reply(
                    '🎬 *Set Intro / Welcome Video*\n\n' +
                    'Reply to (or attach) a video, GIF, or animated sticker with:\n' +
                    '`.introcard video`\n\n' +
                    'It is automatically trimmed to a neat rectangle (16:9) shape.\n' +
                    'Then run `.introcard on` so new members get welcomed with it.\n\n' +
                    'Remove it later with `.introcard delvideo`.'
                );
            }

            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
            try {
                let outBuf;
                if (videoNode || gifNode) {
                    const node   = videoNode || gifNode;
                    const stream = await downloadContentFromMessage(node, 'video');
                    const raw    = await streamToBuffer(stream);
                    if (!raw?.length) throw new Error('empty video buffer');
                    outBuf = await toRectangleMp4(raw, '.mp4');
                } else {
                    const stream = await downloadContentFromMessage(stickerNode, 'sticker');
                    const webp   = await streamToBuffer(stream);
                    if (!webp?.length) throw new Error('empty sticker buffer');
                    outBuf = await toRectangleMp4(webp, '.webp');
                }
                if (!outBuf || outBuf.length < 200) throw new Error('conversion produced empty file');

                fs.mkdirSync(INTRO_DIR, { recursive: true });
                const dest = introVideoPath(from);
                fs.writeFileSync(dest, outBuf);
                database.setGroup(from, 'introcardVideo', dest);
                // Auto-enable so it starts working right away.
                database.setGroup(from, 'introcard', true);

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
                await sock.sendMessage(from, {
                    video:    { url: dest },
                    mimetype: 'video/mp4',
                    gifPlayback: true,
                    caption:
                        '✅ *Intro welcome video set!*\n\n' +
                        `📦 Trimmed to rectangle (640×360) — ${(outBuf.length/1024/1024).toFixed(2)} MB\n` +
                        '🎉 New members will now be welcomed with this clip.\n' +
                        '_Use `.introcard delvideo` to remove it._',
                }, { quoted: msg });
            } catch (e) {
                console.error('[introcard:video]', e.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
                return reply('❌ Failed to set intro video: ' + e.message);
            }
            return;
        }

        // ── .introcard delvideo ─ remove the welcome video ──────────────────
        if (sub === 'delvideo' || sub === 'rmvideo' || sub === 'resetvideo') {
            const dest = introVideoPath(from);
            try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (_) {}
            database.setGroup(from, 'introcardVideo', null);
            return reply('✅ Intro welcome video removed. New members will get the card image instead.');
        }

        // ── .introcard msg <text> ──────────────────────────────────────────
        if (sub === 'msg') {
            const customMsg = args.slice(1).join(' ').trim();
            if (!customMsg) return reply('❌ Please provide a message.\nUse @user and @group as placeholders.');
            database.setGroup(from, 'introcardMessage', customMsg);
            return reply(
                `╭─❒ ◈ 𝙎𝙐𝙆𝙐᳇𝘼 ❒\n` +
                `│ ✅ *Intro Message Set*\n` +
                `│ ${customMsg}\n` +
                `╰─⛧ 𝓹𝓪𝓼𝓺𝓪 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭`
            );
        }

        // ── .introcard title <text> ────────────────────────────────────────
        if (sub === 'title') {
            const title = args.slice(1).join(' ').trim();
            if (!title) return reply('❌ Please provide a title.');
            database.setGroup(from, 'introcardTitle', title);
            return reply(`✅ Intro card title set to: *${title}*`);
        }

        // ── .introcard color <light|dark|fire|ocean|royal> ────────────────
        if (sub === 'color' || sub === 'theme') {
            const theme = args[1]?.toLowerCase();
            const valid = ['light', 'dark', 'fire', 'ocean', 'royal'];
            if (!theme || !valid.includes(theme))
                return reply(`❌ Choose a theme: ${valid.join(', ')}`);
            database.setGroup(from, 'introcardTheme', theme);
            return reply(`✅ Intro card theme set to: *${theme}*`);
        }

        // ── .introcard reset ───────────────────────────────────────────────
        if (sub === 'reset') {
            database.setGroup(from, 'introcardMessage', null);
            database.setGroup(from, 'introcardTitle',   null);
            database.setGroup(from, 'introcardTheme',   null);
            return reply('✅ Intro card text/theme reset to defaults. (Video, if any, is kept — use `.introcard delvideo` to remove it.)');
        }

        // ── .introcard preview / test ──────────────────────────────────────
        if (sub === 'preview' || sub === 'test') {
            try {
                const prev = database.getGroup(from).introcard;
                if (!prev) database.setGroup(from, 'introcard', true);
                await eventManager.handleGroupParticipantsEvent(sock, phoneNumber, {
                    id: from,
                    participants: [sender],
                    action: 'add',
                    author: sender,
                });
                if (!prev) database.setGroup(from, 'introcard', false);
            } catch (e) {
                return reply(`❌ Intro card preview failed: ${e.message}`);
            }
            return;
        }

        // ── Show status / help ─────────────────────────────────────────────
        const grp    = database.getGroup(from);
        const hasVid = fs.existsSync(introVideoPath(from));
        return reply(
            `╭─❒ ◈ 𝙎𝙐𝙆𝙐᳇𝘼 — 𝗜𝗡𝗧𝗥𝗢 𝗖𝗔𝗥𝗗 ❒\n` +
            `│\n` +
            `│ 📌 *Status:* ${grp.introcard ? '✅ ON' : '❌ OFF'}\n` +
            `│ 🎬 *Video:*  ${hasVid ? '✅ set (rectangle)' : '❌ none'}\n` +
            `│ 🎨 *Theme:*  ${grp.introcardTheme || 'default'}\n` +
            `│ 📝 *Msg:*    ${grp.introcardMessage || 'default'}\n` +
            `│\n` +
            `│ ⚙️ *Commands:*\n` +
            `│ • .introcard on/off\n` +
            `│ • .introcard video   (reply to a video/gif)\n` +
            `│ • .introcard delvideo\n` +
            `│ • .introcard msg <text>  (@user @group)\n` +
            `│ • .introcard title <text>\n` +
            `│ • .introcard color <light|dark|fire|ocean|royal>\n` +
            `│ • .introcard preview  (alias: .introcard test)\n` +
            `│ • .introcard reset\n` +
            `╰─⛧ 𝓹𝓪𝓼𝓺𝓪 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭`
        );
    },
};

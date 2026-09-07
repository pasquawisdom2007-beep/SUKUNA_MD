/**
 * Anime Reaction Factory
 * Sends a real, animated anime GIF as a playable WhatsApp "GIF" (video with
 * gifPlayback) — with robust fallbacks so a reaction command NEVER comes back
 * empty.
 *
 * GIF sources (in order, all verified working & key-free):
 *   1. https://api.gifukai.com/v1/<reaction>?pairing=fm    ← BILLIE-compatible primary
 *   2. https://api.otakugifs.xyz/gif?reaction=<reaction>   ← secondary catalogue
 *   3. https://purrbot.site/api/img/sfw/<reaction>/gif      ← tertiary fallback
 *   4. Static fallback list passed per-command               ← last resort
 *
 * Delivery (in order):
 *   1. GIF → MP4 (ffmpeg-static) → video { gifPlayback:true }  ← plays as a GIF
 *   2. raw GIF buffer → video { gifPlayback:true }             ← some forks accept this
 *   3. GIF → animated WebP (sharp) → sticker                   ← animates without ffmpeg
 *   4. static image / url                                       ← guaranteed something shows
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Browser-like UA — several CDNs reject "bot" agents with 403.
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Map a command reaction to an otakugifs.xyz reaction keyword.
const OTAKU_MAP = {
    slap: 'slap', poke: 'poke', punch: 'punch', smack: 'smack', kick: 'kick',
    kiss: 'kiss', hug: 'hug', cuddle: 'cuddle', pat: 'pat', cry: 'cry',
    wink: 'wink', blush: 'blush', bite: 'bite', tickle: 'tickle', lick: 'lick',
    dance: 'dance', happy: 'happy', laugh: 'laugh', wave: 'wave', bonk: 'punch',
    kill: 'kill', milf: 'love', shinobu: 'dance', awoo: 'happy', love: 'love',
    nuzzle: 'nuzzle', handhold: 'handhold', pinch: 'pinch', stare: 'stare',
};

// purrbot.site SFW gif categories we can safely fall back to.
const PURRBOT_SET = new Set([
    'bite', 'blush', 'cry', 'cuddle', 'dance', 'hug', 'kiss', 'lick',
    'pat', 'poke', 'slap', 'smile', 'tickle',
]);

function otakuReaction(reaction) {
    return OTAKU_MAP[reaction] || reaction;
}

async function fetchJson(url, ms = 12000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'user-agent': UA, accept: 'application/json' },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
}

async function fetchBuffer(url, ms = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'user-agent': UA, accept: 'image/gif,image/*,video/*,*/*' },
        });
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        // Some GIF CDNs return application/octet-stream or omit content-type.
        // Validate the bytes instead of rejecting a playable GIF by header.
        if (!ab.byteLength) return null;
        const buf = Buffer.from(ab);
        const ct = res.headers.get('content-type') || '';
        const isGif = buf.length >= 6 && (buf.subarray(0, 6).toString() === 'GIF87a' || buf.subarray(0, 6).toString() === 'GIF89a');
        const isImageOrVideo = /^(image|video)\//i.test(ct) || /application\/octet-stream/i.test(ct);
        return isGif || isImageOrVideo ? buf : null;
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
}

async function resolveGifUrl(reaction) {
    const key = otakuReaction(reaction);

    // 1) BILLIE-compatible Gifukai API. It returns { url, anime }.
    const gj = await fetchJson(`https://api.gifukai.com/v1/${encodeURIComponent(key)}?pairing=fm`, 15000);
    if (gj && typeof gj.url === 'string' && /^https?:\/\//i.test(gj.url)) return gj.url;

    // 2) otakugifs.xyz
    const oj = await fetchJson(`https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(key)}`);
    if (oj && typeof oj.url === 'string' && /^https?:\/\//i.test(oj.url)) return oj.url;

    // 3) purrbot.site (only categories it supports)
    if (PURRBOT_SET.has(key)) {
        const pj = await fetchJson(`https://purrbot.site/api/img/sfw/${key}/gif`);
        const link = pj?.link;
        if (typeof link === 'string' && /^https?:\/\//i.test(link)) return link;
    }
    return null;
}

async function resolveGifBuffer(reaction, fallbacks) {
    const url = await resolveGifUrl(reaction);
    if (url) {
        const buf = await fetchBuffer(url);
        if (buf) return { buf, url };
    }
    if (fallbacks?.length) {
        for (const fb of [...fallbacks].sort(() => Math.random() - 0.5)) {
            const buf = await fetchBuffer(fb);
            if (buf) return { buf, url: fb };
        }
    }
    return null;
}

/** Convert a GIF buffer to an MP4 buffer using the bundled ffmpeg-static binary. */
function gifToMp4(gifBuf) {
    return new Promise((resolve) => {
        let ffmpegPath;
        try {
            ffmpegPath = require('ffmpeg-static');
        } catch {
            return resolve(null);
        }
        if (!ffmpegPath || !fs.existsSync(ffmpegPath)) return resolve(null);

        const tmp = os.tmpdir();
        const inFile = path.join(tmp, `rx_${Date.now()}_${Math.random().toString(36).slice(2)}.gif`);
        const outFile = inFile.replace(/\.gif$/, '.mp4');
        try {
            fs.writeFileSync(inFile, gifBuf);
        } catch {
            return resolve(null);
        }

        const args = [
            '-y', '-i', inFile,
            '-movflags', 'faststart',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            outFile,
        ];
        const cleanup = () => {
            try { fs.unlinkSync(inFile); } catch {}
            try { fs.unlinkSync(outFile); } catch {}
        };

        let done = false;
        const finish = (val) => { if (!done) { done = true; cleanup(); resolve(val); } };

        let proc;
        try {
            proc = spawn(ffmpegPath, args, { stdio: 'ignore' });
        } catch {
            return finish(null);
        }
        const killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 25000);
        proc.on('error', () => { clearTimeout(killTimer); finish(null); });
        proc.on('close', (code) => {
            clearTimeout(killTimer);
            if (code === 0) {
                try {
                    const out = fs.readFileSync(outFile);
                    return finish(out && out.length > 100 ? out : null);
                } catch { return finish(null); }
            }
            finish(null);
        });
    });
}

/** Convert a GIF buffer to an animated WebP sticker buffer using sharp (no ffmpeg). */
async function gifToAnimatedWebp(gifBuf) {
    try {
        const sharp = require('sharp');
        return await sharp(gifBuf, { animated: true })
            .resize(512, 512, { fit: 'inside' })
            .webp({ quality: 60, effort: 3 })
            .toBuffer();
    } catch {
        return null;
    }
}

function resolveTarget(msg, args) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctx?.mentionedJid || [];
    const quotedParticipant = ctx?.participant;
    let target = mentioned[0] || quotedParticipant;
    if (!target && args?.length) {
        const digits = args[0].replace(/[^0-9]/g, '');
        if (digits) target = digits + '@s.whatsapp.net';
    }
    return target || null;
}

function makeAnimeReaction(opts) {
    const {
        name, emoji, verb, selfVerb,
        reaction = name,
        title = verb.toUpperCase(),
        aliases = [],
        fallbacks = [],
        description = `Send a ${name} reaction GIF`,
    } = opts;

    return {
        name,
        aliases,
        description,
        category: 'fun',
        async execute({ sock, msg, from, reply, args }) {
            const sender = msg.key.participant || msg.key.remoteJid;
            const senderTag = '@' + sender.split('@')[0];
            const target = resolveTarget(msg, args);

            let caption;
            let mentions = [sender];
            if (target && target !== sender) {
                const targetTag = '@' + target.split('@')[0];
                caption = `${emoji} *${title}!*\n\n${senderTag} ${verb} ${targetTag}!`;
                mentions = [sender, target];
            } else {
                caption = `${emoji} *${title}!*\n\n${senderTag} ${selfVerb}.`;
            }

            try { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }); } catch {}

            const got = await resolveGifBuffer(reaction, fallbacks);
            if (!got) {
                try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch {}
                return reply(caption + '\n\n_(GIF service temporarily unavailable — try again.)_', { mentions });
            }

            const ok = async () => { try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }); } catch {} };

            // 1) Best: convert GIF → MP4 and send as a playable GIF (video + gifPlayback).
            const mp4 = await gifToMp4(got.buf);
            if (mp4) {
                try {
                    await sock.sendMessage(from, {
                        video: mp4, gifPlayback: true, mimetype: 'video/mp4', caption, mentions,
                    }, { quoted: msg });
                    return ok();
                } catch {}
            }

            // 2) Try sending the raw GIF buffer as video/gifPlayback.
            try {
                await sock.sendMessage(from, {
                    video: got.buf, gifPlayback: true, mimetype: 'image/gif', caption, mentions,
                }, { quoted: msg });
                return ok();
            } catch {}

            // 3) Animated WebP sticker (animates without ffmpeg) + caption as a separate message.
            const webpBuf = await gifToAnimatedWebp(got.buf);
            if (webpBuf) {
                try {
                    await sock.sendMessage(from, { sticker: webpBuf }, { quoted: msg });
                    await reply(caption, { mentions });
                    return ok();
                } catch {}
            }

            // 4) Static image, then a plain link — guarantee the user sees the reaction.
            try {
                await sock.sendMessage(from, {
                    image: got.buf, mimetype: 'image/gif', caption, mentions,
                }, { quoted: msg });
                return ok();
            } catch {}

            try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch {}
            return reply(caption + `\n\n${got.url}`, { mentions });
        },
    };
}

module.exports = { makeAnimeReaction };

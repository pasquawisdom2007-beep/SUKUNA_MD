/**
 * TG Sticker Command — fetch a Telegram sticker pack and send it to WhatsApp
 * as one named native sticker pack instead of one sticker message at a time.
 * Usage: .tgsticker <https://t.me/addstickers/PackName>
 *
 * Pack identity shown in WhatsApp:
 *   Name: Sukuna MD by Pasqua
 *   Publisher: Pasqua
 *
 * DEPENDENCIES (already in package.json):
 *   - ffmpeg-static
 *   - sharp
 *   - axios
 *
 * For .tgs animated Lottie stickers (optional):
 *   pip install 'rlottie-python[full]' --break-system-packages
 *   Without it, .tgs stickers are skipped and the summary tells you.
 */
'use strict';

const axios  = require('axios');
const sharp  = require('sharp');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');
const zlib   = require('zlib');
const { spawn, execSync } = require('child_process');

let FFMPEG;
try {
    const staticPath = require('ffmpeg-static');
    FFMPEG = staticPath && fs.existsSync(staticPath) ? staticPath : 'ffmpeg';
} catch {
    FFMPEG = 'ffmpeg';
}

const TG_TOKEN = process.env.TG_BOT_TOKEN || '8761223803:AAHcVKeOB4hg1m8PpTCX-6HDar9-AKEWhtI';
const TG_API   = TG_TOKEN ? `https://api.telegram.org/bot${TG_TOKEN}` : '';
const TG_FILE  = TG_TOKEN ? `https://api.telegram.org/file/bot${TG_TOKEN}` : '';
const MAX_SEND = 60; // Pasqua Baileys enforces a 60-sticker native-pack limit.
const PACK_NAME = 'Sukuna MD by Pasqua';
const PACK_PUBLISHER = 'Pasqua';

function tmpFile(ext) {
    return path.join(os.tmpdir(), `tgs-${crypto.randomBytes(6).toString('hex')}${ext}`);
}
function tmpDir() {
    const d = path.join(os.tmpdir(), `tgs-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
}
function cleanUp(...paths) {
    for (const p of paths) {
        if (!p) continue;
        try {
            const st = fs.statSync(p);
            if (st.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
            else fs.unlinkSync(p);
        } catch {}
    }
}

/** Download URL → Buffer. */
async function dl(url) {
    const r = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 40000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return Buffer.from(r.data);
}

/** Static WebP/PNG → 512x512 static WebP. */
async function staticToWebp(buf) {
    return sharp(buf)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90, lossless: false, effort: 4 })
        .toBuffer();
}

/**
 * FFmpeg writes a zero RIFF length when WebP is streamed to stdout. WhatsApp
 * and ffprobe can reject that container even when its frame chunks are valid.
 */
function normalizeWebpContainer(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const expectedSize = buf.length - 8;
    if (buf.readUInt32LE(4) === expectedSize) return buf;
    const normalized = Buffer.from(buf);
    normalized.writeUInt32LE(expectedSize >>> 0, 4);
    return normalized;
}

function hasAnimationChunks(buf) {
    let offset = 12;
    while (offset + 8 <= buf.length) {
        const chunk = buf.toString('ascii', offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        if (chunk === 'ANIM' || chunk === 'ANMF') return true;
        if (size > buf.length - offset - 8) return false;
        offset += 8 + size + (size % 2);
    }
    return false;
}

function validateAnimatedWebp(buf) {
    const out = normalizeWebpContainer(buf);
    if (!out || out.length < 1024 || !hasAnimationChunks(out)) return null;
    return sharp(out, { animated: true }).metadata()
        .then(meta => meta.width && meta.height && (!meta.pages || meta.pages >= 2) ? out : null)
        .catch(() => null);
}

function runFfmpegToAnimatedWebp(args, inputBuf = null) {
    return new Promise((resolve) => {
        if (!FFMPEG) return resolve(null);
        let settled = false;
        const finish = val => { if (!settled) { settled = true; resolve(val); } };
        const ff = spawn(FFMPEG, args);
        const chunks = [];
        const timer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} finish(null); }, 30000);
        ff.stdout.on('data', c => chunks.push(c));
        ff.stderr.on('data', () => {});
        ff.on('error', () => { clearTimeout(timer); finish(null); });
        ff.on('close', async code => {
            clearTimeout(timer);
            if (code !== 0 || !chunks.length) {
                console.error(`[tgsticker] FFmpeg animation exit=${code}, bytes=${chunks.reduce((sum, chunk) => sum + chunk.length, 0)}`);
                return finish(null);
            }
            const output = await validateAnimatedWebp(Buffer.concat(chunks));
            if (!output) console.error('[tgsticker] FFmpeg output failed animated-WebP validation');
            finish(output);
        });
        ff.stdin.on('error', () => {});
        if (inputBuf) ff.stdin.end(inputBuf);
        else ff.stdin.end();
    });
}

/** Any video/gif buffer → animated WebP via ffmpeg stdin→stdout pipe. */
function ffmpegToAnimatedWebp(inputBuf, inputFps = 15) {
    return runFfmpegToAnimatedWebp([
        '-hide_banner', '-loglevel', 'error',
        '-i', 'pipe:0',
        '-vf', `scale=512:512:force_original_aspect_ratio=decrease,fps=${inputFps}`,
        '-vcodec', 'libwebp_anim',
        '-lossless', '0',
        '-compression_level', '6',
        '-q:v', '75',
        '-loop', '0',
        '-preset', 'default',
        '-an', '-vsync', '0',
        '-f', 'webp',
        'pipe:1',
    ], inputBuf);
}

/** PNG frames rendered from a TGS Lottie file → animated WebP. */
function ffmpegFramesToAnimatedWebp(framesDir, inputFps = 30) {
    return runFfmpegToAnimatedWebp([
        '-hide_banner', '-loglevel', 'error',
        '-framerate', String(inputFps),
        '-i', path.join(framesDir, 'frame_%04d.png'),
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease',
        '-vcodec', 'libwebp_anim',
        '-lossless', '0',
        '-compression_level', '6',
        '-q:v', '75',
        '-loop', '0',
        '-preset', 'default',
        '-an', '-vsync', '0',
        '-f', 'webp',
        'pipe:1',
    ]);
}

/** Build a static tray cover from the first available sticker. */
async function makePackCover(stickerItems) {
    const staticItem = stickerItems.find(item => !item.isAnimated);
    if (staticItem) return staticToWebp(staticItem.data);

    const first = stickerItems[0]?.data;
    if (!first) return null;
    try {
        return await sharp(first, { animated: true, page: 0, pages: 1 })
            .webp({ quality: 90, lossless: false, effort: 4 })
            .toBuffer();
    } catch (error) {
        console.error('[tgsticker] cover frame error:', error.message);
        return null;
    }
}

async function tgsToAnimatedWebp(buf) {
    const jsonPath = tmpFile('.json');
    const framesDir = tmpDir();
    try {
        const jsonBuf = zlib.gunzipSync(buf);
        fs.writeFileSync(jsonPath, jsonBuf);
        let fps = 30;
        try {
            const lottie = JSON.parse(jsonBuf.toString('utf8'));
            fps = Math.min(Math.max(lottie.fr || 30, 1), 30);
        } catch {}
        const pyScript = `
import sys, os
try:
    import rlottie_python as rl
    from PIL import Image
    anim = rl.LottieAnimation.from_file(sys.argv[1])
    total = anim.lottie_animation_get_totalframe()
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for i in range(total):
        raw = anim.lottie_animation_render(i, width=512, height=512)
        Image.frombuffer('RGBA', (512, 512), bytes(raw), 'raw', 'BGRA').save(
            os.path.join(out, f'frame_{i:04d}.png')
        )
    print(total)
except ImportError:
    print('MISSING_RLOTTIE', file=sys.stderr)
    sys.exit(2)
except Exception as e:
    print(f'ERR:{e}', file=sys.stderr)
    sys.exit(1)
`;
        const pyPath = tmpFile('.py');
        fs.writeFileSync(pyPath, pyScript);
        let frameCount = 0;
        try {
            const out = execSync(`python3 "${pyPath}" "${jsonPath}" "${framesDir}"`, {
                timeout: 60000,
                encoding: 'utf8',
            }).trim();
            frameCount = parseInt(out, 10) || 0;
        } catch (e) {
            const stderr = (e.stderr || '').toString();
            if (stderr.includes('MISSING_RLOTTIE')) return null;
            console.error('[tgsticker] tgs render error:', stderr.slice(-300));
            return null;
        } finally {
            cleanUp(pyPath);
        }
        if (frameCount === 0) return null;
        return await ffmpegFramesToAnimatedWebp(framesDir, fps);
    } catch (err) {
        console.error('[tgsticker] tgsToAnimatedWebp error:', err.message);
        return null;
    } finally {
        cleanUp(jsonPath, framesDir);
    }
}

module.exports = {
    name: 'tgsticker',
    aliases: ['tgstickers', 'tgs2wa'],
    description: 'Convert a Telegram sticker pack into one named WhatsApp sticker pack',
    usage: '.tgsticker <https://t.me/addstickers/PackName>',
    category: 'media',

    async execute({ sock, msg, from, reply, args }) {
        const text = (args || []).join(' ').trim();
        if (!text || !text.includes('t.me/addstickers/')) {
            return reply('❌ Usage: .tgsticker https://t.me/addstickers/PackName');
        }
        if (!TG_TOKEN) {
            return reply('❌ Telegram sticker import is not configured. Add `TG_BOT_TOKEN` to the secure deployment environment.');
        }

        const packName = text.split('/addstickers/')[1].split(/[/?#]/)[0];
        try {
            const { data } = await axios.get(
                `${TG_API}/getStickerSet?name=${encodeURIComponent(packName)}`,
                { timeout: 20000 }
            );
            if (!data.ok) return reply('❌ Could not find that sticker pack. Check the link.');

            const allStickers = data.result.stickers || [];
            const total = allStickers.length;
            if (!total) return reply('❌ This pack has no stickers.');

            const toConvert = allStickers.slice(0, MAX_SEND);
            const capped = total > MAX_SEND;
            const hasVideo = toConvert.some(s => s.is_video);
            const hasAnimated = toConvert.some(s => s.is_animated);
            const packType = hasVideo ? '🎬 Video' : hasAnimated ? '✨ Animated' : '🖼️ Static';
            const stickerItems = [];
            let failed = 0;
            let skipped = 0;

            for (const sticker of toConvert) {
                try {
                    const fileRes = await axios.get(
                        `${TG_API}/getFile?file_id=${encodeURIComponent(sticker.file_id)}`,
                        { timeout: 20000 }
                    );
                    const filePath = fileRes.data?.result?.file_path;
                    if (!filePath) { failed++; continue; }
                    const rawBuf = await dl(`${TG_FILE}/${filePath}`);
                    if (!rawBuf || rawBuf.length < 32) { failed++; continue; }

                    let webpBuf;
                    if (sticker.is_video || filePath.endsWith('.webm')) {
                        webpBuf = await ffmpegToAnimatedWebp(rawBuf);
                        if (!webpBuf) { failed++; continue; }
                    } else if (sticker.is_animated || filePath.endsWith('.tgs')) {
                        webpBuf = await tgsToAnimatedWebp(rawBuf);
                        if (!webpBuf) { skipped++; continue; }
                    } else {
                        webpBuf = await staticToWebp(rawBuf);
                        if (!webpBuf) { failed++; continue; }
                    }
                    if (webpBuf.length < 1024 || webpBuf.length > 1024 * 1024) {
                        failed++;
                        continue;
                    }
                    stickerItems.push({
                        data: webpBuf,
                        isAnimated: hasAnimationChunks(webpBuf),
                        emojis: sticker.emoji ? [sticker.emoji] : ['✨'],
                        accessibilityLabel: sticker.emoji || 'Sukuna MD sticker',
                    });
                } catch (err) {
                    console.error('[tgsticker] sticker conversion error:', err.message);
                    failed++;
                }
            }

            if (!stickerItems.length) {
                return reply(`❌ No stickers could be converted from *${data.result.title || packName}*.`);
            }

            const cover = await makePackCover(stickerItems);
            if (!cover || cover.length < 512 || cover.length > 1024 * 1024) {
                return reply('❌ Could not create a valid static cover for this sticker pack.');
            }

            // Pasqua Baileys builds and uploads one native StickerPackMessage.
            await sock.sendMessage(from, {
                stickers: stickerItems,
                cover,
                name: PACK_NAME,
                publisher: PACK_PUBLISHER,
                description: `Imported from Telegram pack: ${data.result.title || packName}`,
            }, { quoted: msg });

            let summary = `✅ *${PACK_NAME}*\n` +
                `Publisher: ${PACK_PUBLISHER}\n` +
                `Source: *${data.result.title || packName}*\n` +
                `Type: ${packType}\n` +
                `Packed: ${stickerItems.length}/${toConvert.length} stickers`;
            if (failed) summary += `\n❌ Failed: ${failed}`;
            if (skipped) summary += `\n⚠️ Skipped ${skipped} Lottie (.tgs) stickers`;
            if (capped) summary += `\n\n_Pack has ${total} total — native pack limit is ${MAX_SEND}_`;
            return reply(summary);
        } catch (err) {
            console.error('[tgsticker] fatal error:', err.message);
            return reply('❌ Sticker-pack import failed. No individual sticker spam was sent.');
        }
    },
};

/**
 * ATTP — Animated Text To Picture (sticker)
 * Usage: .attp <text>
 *
 * Generates the animated sticker LOCALLY with sharp + node-webpmux (no
 * external API), so it never breaks when a third-party service goes down.
 * Text is rendered as colour-cycling frames and assembled into an animated
 * WebP sticker that WhatsApp accepts directly.
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');
const webp  = require('node-webpmux');

const COLORS = ['#ff2b2b', '#ffd52b', '#2bff6a', '#2b8bff', '#c22bff', '#ff2bd0'];
const SIZE   = 512;
const FONT_FAMILY = 'AttpFont';

let _libReady = false;
async function ensureLib() {
    if (!_libReady) { await webp.Image.initLib(); _libReady = true; }
}

// Load the bundled font once and embed it (base64) into the SVG. Without this,
// hosts that lack system fonts render blank text -> "empty" stickers.
let _fontFace = null;
function getFontFace() {
    if (_fontFace !== null) return _fontFace;
    try {
        const fontPath = path.join(__dirname, '..', '..', 'assets', 'attp-font.ttf');
        const b64 = fs.readFileSync(fontPath).toString('base64');
        _fontFace =
            `<defs><style type="text/css">@font-face{font-family:'${FONT_FAMILY}';` +
            `src:url(data:font/ttf;base64,${b64}) format('truetype');` +
            `font-weight:bold;font-style:normal;}</style></defs>`;
    } catch (e) {
        console.error('[attp] font load failed, falling back to system font:', e.message);
        _fontFace = '';
    }
    return _fontFace;
}

function escapeXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Wrap text into at most `maxLines` lines of roughly `maxChars` characters.
function wrapText(text, maxChars = 12, maxLines = 3) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
        if (!cur) { cur = w; }
        else if ((cur + ' ' + w).length <= maxChars) { cur += ' ' + w; }
        else { lines.push(cur); cur = w; }
        if (lines.length >= maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    // Hard-cut anything that is still too long.
    return lines.slice(0, maxLines).map(l => (l.length > maxChars + 4 ? l.slice(0, maxChars + 3) + '…' : l));
}

function buildSvg(lines, color) {
    const longest  = Math.max(...lines.map(l => l.length), 1);
    // Scale font so the longest line fits inside ~460px of the 512 canvas.
    const fontSize = Math.max(48, Math.min(150, Math.floor(920 / longest)));
    const lineGap  = fontSize * 1.15;
    const totalH   = lineGap * lines.length;
    const startY   = (SIZE - totalH) / 2 + fontSize * 0.8;
    const tspans = lines.map((l, i) =>
        `<text x="${SIZE / 2}" y="${startY + i * lineGap}" font-size="${fontSize}" ` +
        `fill="${color}" text-anchor="middle" font-family="'${FONT_FAMILY}',sans-serif" font-weight="bold" ` +
        `stroke="#000000" stroke-width="${Math.max(2, fontSize * 0.04)}" paint-order="stroke">` +
        `${escapeXml(l)}</text>`
    ).join('');
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${getFontFace()}${tspans}</svg>`
    );
}

async function makeAttpSticker(text) {
    await ensureLib();
    const lines  = wrapText(text);
    const frames = [];
    for (const color of COLORS) {
        const svg = buildSvg(lines, color);
        // IMPORTANT: force each frame to exactly SIZE×SIZE. With density:150 the
        // SVG renders larger (~1067px), and a frame/canvas size mismatch makes
        // node-webpmux produce a corrupt animation that shows up as an empty
        // sticker in WhatsApp.
        const buf = await sharp(svg, { density: 150 })
            .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ lossless: true })
            .toBuffer();
        frames.push(await webp.Image.generateFrame({ buffer: buf, delay: 130 }));
    }
    return webp.Image.save(null, {
        width: SIZE,
        height: SIZE,
        frames,
        bgColor: [0, 0, 0, 0],
        loops: 0,
    });
}

module.exports = {
    name: 'attp',
    aliases: ['animatedttp', 'text2gif'],
    description: 'Create an animated sticker from text',
    category: 'media',

    async execute({ sock, msg, from, reply, args }) {
        const text = (args || []).join(' ').trim();
        if (!text) {
            return reply(
                `✨ *Animated Text To Picture*\n\n` +
                `Usage: .attp <text>\n` +
                `Example: .attp Hello World`
            );
        }

        try {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
            const sticker = await makeAttpSticker(text);
            if (!sticker || sticker.length < 200) throw new Error('empty sticker buffer');

            await sock.sendMessage(from, { sticker }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (err) {
            console.error('[attp] error:', err.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            reply('❌ Failed to create animated text sticker. Please try a shorter text.');
        }
    },
};

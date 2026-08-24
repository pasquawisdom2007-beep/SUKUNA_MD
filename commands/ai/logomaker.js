'use strict';

const smartAI = require('../../utils/smartAI');

const MAX_NAME = 60;
const COOLDOWN_MS = 45_000;
const cooldowns = new Map();
const buttonCooldowns = new Map();

function cleanName(value) {
    return String(value || '')
        .replace(/[\r\n<>|{}\[\]`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_NAME);
}

function cleanStyle(value) {
    return String(value || '')
        .replace(/[\r\n<>|{}\[\]`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
}

function parseRequest(args = []) {
    const raw = args.join(' ').trim();
    if (!raw) return { name: '', style: '' };
    const styleFlag = raw.match(/^(.*?)\s+--style=(.+)$/i);
    if (styleFlag) return { name: cleanName(styleFlag[1]), style: cleanStyle(styleFlag[2]) };
    const [first, ...rest] = raw.split(/\s+/);
    return { name: cleanName(first), style: cleanStyle(rest.join(' ')) };
}

function buildPrompt(name, role, style) {
    const direction = style || 'premium, modern, memorable, clean brand identity';
    const common = `Brand name: "${name}". Visual direction: ${direction}. Use a simple recognizable symbol, balanced geometry, intentional negative space, professional vector-inspired finish, sharp clean edges, polished brand presentation, no mockup, no watermark, no extra words, no misspelled text.`;
    if (role === 'primary') {
        return `Create a premium primary wordmark logo concept for ${common} The exact brand name must be the only readable text and should be large, centered, and legible. Horizontal composition, transparent-looking or plain neutral background, suitable for a website header, business card, and WhatsApp brand identity.`;
    }
    return `Create a matching secondary logo mark for ${common} Use the same visual identity, palette, symbol language, and typography direction as a companion to the primary logo. Focus on a distinctive emblem or monogram that remains recognizable as a small profile picture or app icon. Square composition, centered, no extra words.`;
}

function makeButton(prefix, name, action, text) {
    const encoded = encodeURIComponent(name);
    return {
        buttonId: `sukuna_logo:${encoded}:${action}`,
        buttonText: { displayText: text },
        type: 1,
        __prefix: prefix,
    };
}

function buildButtons(prefix, name) {
    return [
        makeButton(prefix, name, 'regenerate', '✨ Generate Again'),
        makeButton(prefix, name, 'dark', '🖤 Dark Luxe'),
        makeButton(prefix, name, 'minimal', '◻️ Minimal'),
        makeButton(prefix, name, 'icon', '🔷 Profile Icon'),
    ];
}

async function sendLogoPair({ sock, msg, from, reply, prefix, name, style, action = 'new' }) {
    const effectiveStyle = action === 'dark'
        ? 'dark luxury, black and gold, high contrast, premium'
        : action === 'minimal'
            ? 'minimalist, monochrome, geometric, generous whitespace'
            : action === 'icon'
                ? 'bold emblem, compact profile icon, strong silhouette, high contrast'
                : style || 'premium, modern, memorable, clean brand identity';

    const [primary, secondary] = await Promise.all([
        smartAI.generateImage(buildPrompt(name, 'primary', effectiveStyle), { width: 1200, height: 800 }),
        smartAI.generateImage(buildPrompt(name, 'secondary', effectiveStyle), { width: 1024, height: 1024 }),
    ]);
    if (!primary && !secondary) throw new Error('the free image provider returned no logo images');

    const actionLabel = action === 'new' || action === 'regenerate' ? 'Original pair' : `${action} variation`;
    const caption = `🎨 *SUKUNA LOGO STUDIO*\n\nBrand: *${name}*\nSet: ${actionLabel}\n\nThe first image is the primary wordmark. The second is the matching secondary mark/profile icon.\n\n_Free Pollinations image generation · results are creative concepts and may need a final designer pass for exact typography._`;
    if (primary) await sock.sendMessage(from, { image: primary, caption }, { quoted: msg });
    if (secondary) await sock.sendMessage(from, { image: secondary, caption: `🔷 *${name} — SECONDARY MARK*\n\nMatched to the primary logo above.` }, { quoted: msg });

    const buttons = buildButtons(prefix || '.', name).map(({ __prefix, ...button }) => button);
    try {
        await sock.sendMessage(from, {
            text: `Choose a ${name} logo direction:`,
            footer: 'SUKUNA LOGO STUDIO · 4 actions',
            buttons,
            headerType: 1,
        }, { quoted: msg });
    } catch (error) {
        console.error('[LOGOMAKER buttons]', error.message);
        await reply(`Use these variations manually:\n${prefix || '.'}logomaker ${name} --style=dark luxury\n${prefix || '.'}logomaker ${name} --style=minimal\n${prefix || '.'}logomaker ${name} --style=bold profile icon`);
    }
}

async function execute({ sock, msg, from, reply, args, sender, prefix = '.' }) {
    const { name, style } = parseRequest(args);
    if (!name) {
        return reply(`🎨 *Logo Maker*\n\nUsage: ${prefix}logomaker <brand name> [style]\nExamples:\n${prefix}logomaker Pasqua\n${prefix}logomaker Pasqua luxury black and gold\n${prefix}logomaker Pasqua --style=minimal modern`);
    }
    const key = `${from || 'chat'}:${sender || 'user'}`;
    const last = cooldowns.get(key) || 0;
    if (Date.now() - last < COOLDOWN_MS) {
        const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
        return reply(`⏳ Logo generation is cooling down for this chat. Try again in ${wait}s.`);
    }
    cooldowns.set(key, Date.now());
    try {
        await reply(`🎨 Creating two coordinated logo concepts for *${name}*...`);
        await sendLogoPair({ sock, msg, from, reply, prefix, name, style });
    } catch (error) {
        cooldowns.delete(key);
        console.error('[LOGOMAKER]', error.message);
        return reply(`❌ Logo generation failed: ${error.message}`);
    }
}

async function handleButton(buttonId, context) {
    const match = String(buttonId || '').match(/^sukuna_logo:([^:]+):(regenerate|dark|minimal|icon)$/);
    if (!match) return false;
    const name = cleanName(decodeURIComponent(match[1]));
    if (!name) return true;
    const { sock, msg, from, phoneNumber, reply } = context;
    const prefix = typeof context.getPrefix === 'function' ? context.getPrefix(phoneNumber) : (context.prefix || '.');
    const sender = msg?.key?.participant || msg?.key?.remoteJid || 'user';
    const key = `${from || 'chat'}:${sender}`;
    const last = buttonCooldowns.get(key) || 0;
    if (Date.now() - last < COOLDOWN_MS) {
        const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
        await reply(`⏳ Logo variations are cooling down. Try again in ${wait}s.`);
        return true;
    }
    buttonCooldowns.set(key, Date.now());
    try {
        await reply(`🎨 Generating the *${name}* ${match[2]} variation...`);
        await sendLogoPair({ sock, msg, from, reply, prefix, name, style: '', action: match[2] });
    } catch (error) {
        buttonCooldowns.delete(key);
        console.error('[LOGOMAKER button]', error.message);
        await reply(`❌ Logo variation failed: ${error.message}`);
    }
    return true;
}

module.exports = {
    name: 'logomaker',
    aliases: ['brandlogo', 'logodesign', 'logostudio'],
    description: 'Generate two coordinated logo images with four action buttons',
    category: 'ai',
    execute,
    handleButton,
    parseRequest,
    buildPrompt,
};

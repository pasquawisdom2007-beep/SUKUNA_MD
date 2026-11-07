'use strict';

// Chroma uses the hybrid message shown in the supplied eval snippet:
// interactiveMessage.bloksWidget renders the A2UI visual surface, while
// nativeFlowMessage keeps the real WhatsApp buttons underneath it.

const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@pasqua-dev/baileys');
const config = require('../config');
const fs = require('fs');
const CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb8YB2T90x2zvQLnEb2k';
const TELEGRAM_URL = config.owner?.telegram
    ? `https://${String(config.owner.telegram).replace(/^https?:\/\//i, '')}`
    : 'https://t.me/Pasquaking';
const PASQUA_BRAND = 'PASQUA TECH';
const COUPON_CODE = process.env.PASQUA_MENU_COUPON || 'PASQUA TECH';
const COUPON_EXPIRES_AT = process.env.PASQUA_MENU_COUPON_EXPIRES_AT || '2026-10-28T23:59:59+01:00';
const CATEGORY_ORDER = ['owner', 'admin', 'moderation', 'economy', 'fun', 'media', 'ai', 'utility', 'group', 'general', 'unicode', 'textmaker', 'games', 'anime-nsfw', '18plus'];

function titleCase(category) {
    return String(category || 'general').replace(/(^|-)(\w)/g, (_, divider, letter) => `${divider ? ' ' : ''}${letter.toUpperCase()}`);
}
function commandCards(commands) {
    const grouped = new Map();
    const source = commands instanceof Map ? commands.values() : Array.isArray(commands) ? commands : [];
    for (const command of source) {
        if (!command?.name || typeof command.execute !== 'function') continue;
        const category = String(command.category || 'general').toLowerCase();
        if (!grouped.has(category)) grouped.set(category, new Map());
        if (!grouped.get(category).has(command.name)) grouped.get(category).set(command.name, String(command.description || command.desc || '').trim());
    }
    const order = [...CATEGORY_ORDER.filter(category => grouped.has(category)), ...Array.from(grouped.keys()).filter(category => !CATEGORY_ORDER.includes(category)).sort()];
    return order.map(category => ({
        title: titleCase(category),
        commands: Array.from(grouped.get(category).keys()).sort().map(name => ({ name, description: grouped.get(category).get(name) })),
    }));
}
function couponOffer(now = new Date()) {
    const expiry = new Date(COUPON_EXPIRES_AT);
    if (Number.isNaN(expiry.getTime()) || now > expiry) return { active: false, text: '🏷️ Limited-time offer ended' };
    return { active: true, code: COUPON_CODE, endsOn: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).format(expiry) };
}
function text(id, value, variant = 'body') {
    return { id, component: 'Text', text: value, variant };
}
function buildChromaSurface({ cards, totalCmds, botName = PASQUA_BRAND }) {
    const offer = couponOffer();
    const tableCats = cards.slice(0, 9);
    const components = [
        { id: 'root', component: 'Column', align: 'center', children: ['promotion', 'title', 'dividerTop', 'tableCard', 'dividerBottom', 'footer'] },
        { id: 'promotion', component: 'Column', children: ['promotionRow'] },
        { id: 'promotionRow', component: 'Row', children: ['promoTag', 'promoDivider', 'promotionColumn'] },
        text('promoTag', '🏷️', 'h5'),
        text('promoDivider', '│', 'caption'),
        { id: 'promotionColumn', component: 'Column', children: ['promoName', 'promoEnds', 'promoCodeDivider', 'promoCode'] },
        text('promoName', botName, 'h5'),
        text('promoEnds', offer.active ? `Ends on ${offer.endsOn}` : offer.text, 'h5'),
        { id: 'promoCodeDivider', component: 'Divider' },
        text('promoCode', offer.active ? `Code: ${offer.code} | INC.` : '', 'h5'),
        { id: 'title', component: 'Text', text: `⟡ ${botName} ⟡`, variant: 'h5' },
        { id: 'dividerTop', component: 'Divider' },
        { id: 'tableCard', component: 'Card', child: 'tableColumn' },
        { id: 'tableColumn', component: 'Column', children: ['tableHeader', 'tableDivider', ...tableCats.flatMap((_, index) => [`row${index}`, `divider${index}`])] },
        { id: 'tableHeader', component: 'Row', children: ['categoryHeader', 'countHeader'] },
        text('categoryHeader', 'Category', 'h5'),
        text('countHeader', 'Count', 'h5'),
        { id: 'tableDivider', component: 'Divider' },
        ...tableCats.flatMap((card, index) => [
            { id: `row${index}`, component: 'Row', children: [`category${index}`, `count${index}`] },
            text(`category${index}`, card.title),
            text(`count${index}`, `${card.commands.length} cmds`),
            { id: `divider${index}`, component: 'Divider' },
        ]),
        { id: 'dividerBottom', component: 'Divider' },
        text('footer', `sᴜᴋᴜɴᴀ ᴍᴅ | ${totalCmds} Plugins`, 'caption'),
    ];
    return {
        version: 'v0.9',
        createSurface: {
            surfaceId: 'pasqua-tech-chroma-v2',
            catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
            components,
        },
    };
}

function singleSelect(title, sections) {
    return { name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections }) };
}
function ctaUrl(displayText, url) {
    return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: url }) };
}
function buildCategorySections(cards, prefix) {
    return cards.slice(0, 10).map(card => ({
        title: `${card.title.toUpperCase()} | ${card.commands.length} CMDS`,
        highlight_label: '',
        rows: card.commands.slice(0, 8).map(command => ({
            header: '',
            title: `${prefix}${command.name}`,
            description: (command.description || `${card.title} command`).slice(0, 60),
            id: `chroma:${prefix}${command.name}`,
        })),
    }));
}

function buildChromaContent({ imageMessage, surface, buttons }) {
    return {
        interactiveMessage: {
            header: { imageMessage, hasMediaAttachment: true },
            bloksWidget: {
                type: 'im_a2ui',
                data: JSON.stringify(surface),
                fallback: PASQUA_BRAND,
            },
            nativeFlowMessage: { buttons, messageParamsJson: '' },
        },
    };
}

async function sendChromaMenu({ sock, jid, quoted, prefix = '.', commands, imagePath }) {
    const cards = commandCards(commands);
    const totalCmds = cards.reduce((sum, card) => sum + card.commands.length, 0);
    const imageBuffer = imagePath && fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : null;
    const media = imageBuffer ? { image: imageBuffer } : { image: Buffer.from('') };
    const { imageMessage } = await prepareWAMessageMedia(media, { upload: sock.waUploadToServer });
    const surface = buildChromaSurface({ cards, totalCmds, botName });
    const buttons = [
        singleSelect(`Ξ OPEN MENU (${totalCmds})`, buildCategorySections(cards, prefix)),
        ctaUrl('1st-Channel', CHANNEL_URL),
        ctaUrl('2nd-Channel', TELEGRAM_URL),
    ];
    const content = buildChromaContent({ imageMessage, surface, buttons });
    const wrapped = generateWAMessageFromContent(jid, content, {
        userJid: sock.user?.id,
        quoted: quoted?.message ? quoted : undefined,
    });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

module.exports = { sendChromaMenu, commandCards, couponOffer, buildChromaSurface, buildChromaContent, CHANNEL_URL, TELEGRAM_URL, PASQUA_BRAND, COUPON_CODE, COUPON_EXPIRES_AT };

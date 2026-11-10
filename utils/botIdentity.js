'use strict';

const config = require('../config');

function clean(value, fallback = '') {
    return String(value ?? fallback).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getName() {
    return clean(config.botName || config.owner?.name, 'SUKUNA MD').slice(0, 80) || 'SUKUNA MD';
}

function digits(value) {
    return clean(value).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function normalizeJid(value) {
    const raw = clean(value);
    if (!raw) return '';
    if (raw.endsWith('@g.us') || raw.endsWith('@newsletter') || raw.endsWith('@broadcast')) return raw;
    if (raw.includes('@')) return raw;
    const number = digits(raw);
    return number ? `${number}@s.whatsapp.net` : '';
}

module.exports = {
    getName,
    digits,
    normalizeJid,
};

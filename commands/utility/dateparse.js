'use strict';

const { prefixOf, truncate } = require('../../utils/commandHelpers');

function parseDate(input) {
    if (/^-?\d+$/.test(input)) {
        const number = Number(input);
        if (!Number.isSafeInteger(number)) return null;
        return new Date(Math.abs(number) < 100_000_000_000 ? number * 1000 : number);
    }
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = {
    name: 'dateparse',
    aliases: ['dateconvert', 'epochconvert'],
    description: 'Convert ISO dates and Unix timestamps',
    usage: '.dateparse <ISO date or Unix seconds/milliseconds>',
    category: 'utility',

    async execute({ reply, args, prefix }) {
        const px = prefixOf(prefix);
        const input = (args || []).join(' ').trim();
        if (!input) return reply(`🗓️ *Date Parser*\n\nUsage: ${px}dateparse <ISO date or Unix timestamp>\nExample: ${px}dateparse 2026-08-24T12:00:00Z`);
        if (input.length > 100) return reply('❌ Date input is limited to 100 characters.');
        const date = parseDate(input);
        if (!date) return reply(`❌ Could not parse: ${truncate(input, 100)}`);
        return reply(
            '🗓️ *Date Conversion*\n' +
            `ISO: ${date.toISOString()}\n` +
            `Unix seconds: ${Math.floor(date.getTime() / 1000)}\n` +
            `Unix milliseconds: ${date.getTime()}\n` +
            `Local: ${date.toString()}`
        );
    },
};

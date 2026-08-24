'use strict';

const { prefixOf, quotedMessage, textFromMessage, truncate } = require('../../utils/commandHelpers');

module.exports = {
    name: 'jsonfmt',
    aliases: ['jsonformat', 'jsonpretty'],
    description: 'Validate, format, or minify JSON safely',
    usage: '.jsonfmt [min] <json>',
    category: 'utility',

    async execute({ reply, msg, args, prefix }) {
        const px = prefixOf(prefix);
        const values = [...(args || [])];
        const minify = values[0]?.toLowerCase() === 'min';
        if (minify) values.shift();
        let input = values.join(' ').trim();
        if (!input && quotedMessage(msg)) input = textFromMessage(quotedMessage(msg)).trim();
        if (!input) return reply(`🧾 *JSON Format*\n\nUsage: ${px}jsonfmt [min] <json>`);
        if (input.length > 30_000) return reply('❌ JSON input is limited to 30,000 characters.');
        try {
            const parsed = JSON.parse(input);
            const output = JSON.stringify(parsed, null, minify ? 0 : 2);
            return reply(`✅ *Valid JSON* · ${minify ? 'minified' : 'formatted'}\n\n${truncate(output, 9000)}`);
        } catch (error) {
            return reply(`❌ Invalid JSON: ${truncate(error.message, 350)}`);
        }
    },
};

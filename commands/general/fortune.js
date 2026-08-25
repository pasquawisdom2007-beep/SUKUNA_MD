'use strict';

const FORTUNES = [
    'Small consistent steps turn difficult work into finished work.',
    'A clear plan is often the fastest path through a complicated problem.',
    'Today is a good day to improve one thing and document what changed.',
    'Patience, testing, and careful observation reveal the reliable solution.',
    'The strongest systems are built from simple parts that fail clearly.',
];

module.exports = {
    name: 'fortune',
    aliases: ['wisdom'],
    description: 'Receive a random practical fortune',
    usage: '.fortune',
    category: 'general',

    async execute({ reply }) {
        const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
        await reply(`╭━━━〔 𝑭𝑶𝑹𝑻𝑼𝑵𝑬 〕━━━╮\n│ ${fortune}\n╰━━━━━━━━━━━━━━━━━━━━╯`);
    },
};

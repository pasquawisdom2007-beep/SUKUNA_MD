const { makeTextmakerCommand } = require('../../lib/textmakerFetch');

module.exports = makeTextmakerCommand({
    name: 'fireworkstext',
    ephotoUrl: 'https://en.ephoto360.com/vibrant-fireworks-text-effect-535.html',
    label: 'Fireworks Text',
    emoji: '🎆',
    style: 'fireworks',
    aliases: ['fireworks'],
});

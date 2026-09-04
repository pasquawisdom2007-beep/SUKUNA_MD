const { makeTextmakerCommand } = require('../../lib/textmakerFetch');

module.exports = makeTextmakerCommand({
    name: 'goldtext',
    ephotoUrl: 'https://en.ephoto360.com/gold-text-effect-158.html',
    label: 'Gold Text',
    emoji: '🥇',
    style: 'gold',
    aliases: ['gold'],
});

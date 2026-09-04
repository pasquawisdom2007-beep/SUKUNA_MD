const { makeTextmakerCommand } = require('../../lib/textmakerFetch');

module.exports = makeTextmakerCommand({
    name: 'galaxytext',
    ephotoUrl: 'https://en.ephoto360.com/galaxy-text-effect-new-258.html',
    label: 'Galaxy Text',
    emoji: '🌌',
    style: 'galaxy',
    aliases: ['galaxy'],
});

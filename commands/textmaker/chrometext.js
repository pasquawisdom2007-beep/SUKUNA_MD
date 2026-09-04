const { makeTextmakerCommand } = require('../../lib/textmakerFetch');

module.exports = makeTextmakerCommand({
    name: 'chrometext',
    ephotoUrl: 'https://en.ephoto360.com/glossy-chrome-text-effect-online-424.html',
    label: 'Chrome Text',
    emoji: '🔩',
    style: 'chrome',
    aliases: ['chrome'],
});

const { makeTextmakerCommand } = require('../../lib/textmakerFetch');

module.exports = makeTextmakerCommand({
    name: 'beachtext',
    ephotoUrl: 'https://en.ephoto360.com/create-3d-text-effect-on-the-beach-online-688.html',
    label: 'Beach Text',
    emoji: '🏝️',
    style: 'beach',
    aliases: ['beach'],
});

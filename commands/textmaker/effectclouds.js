const { makeTextmakerCommand } = require('../../lib/textmakerFetch');
module.exports = makeTextmakerCommand({
    name: 'effectclouds',
    ephotoUrl: 'https://en.ephoto360.com/online-cloud-text-effect-generator-739.html',
    label: 'Cloud Effect',
    emoji: '☁️',
    style: 'clouds',
});

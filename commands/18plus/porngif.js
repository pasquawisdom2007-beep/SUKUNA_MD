const { makeNsfwCommand } = require('../../lib/nsfwFetch');

module.exports = makeNsfwCommand({
    name: 'porngif',
    aliases: [],
    endpoint: 'https://prexzyapis.com/nsfw/phgif',
    emoji: '🔞',
    label: 'Porn GIF',
});


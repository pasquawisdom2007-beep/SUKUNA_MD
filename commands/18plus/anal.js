const { makeNsfwCommand } = require('../../lib/nsfwFetch');

module.exports = makeNsfwCommand({
    name: 'anal',
    aliases: [],
    endpoint: 'https://prexzyapis.com/nsfw/anal',
    emoji: '🔞',
    label: 'Anal',
});


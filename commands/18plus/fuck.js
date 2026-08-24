const { makeNsfwCommand } = require('../../lib/nsfwFetch');
module.exports = makeNsfwCommand({
    name: 'fuck',
    aliases: ['sex'],
    endpoint: 'https://prexzyapis.com/nsfw/fuck',
    emoji: '🔥',
    label: 'Fuck',
    timeout: 60000,
});

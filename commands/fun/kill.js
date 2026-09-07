const { makeAnimeReaction } = require('../../lib/animeReaction');
module.exports = makeAnimeReaction({
    name: 'kill', emoji: '🔪', verb: 'killed', selfVerb: 'is plotting a murder',
    reaction: 'kill',
    fallbacks: [
        'https://media.giphy.com/media/xT0BKiwiVJq5B0XhHG/giphy.gif',
        'https://media.giphy.com/media/Zau0yrl17uzdK/giphy.gif'
    ],
    description: 'Kill someone with an anime GIF'
});

'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'spank',
    description: 'Send an Anime NSFW SPANK image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'spank', 'SPANK');
    },
};

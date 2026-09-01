'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'hthigh',
    description: 'Send an Anime NSFW HTHIGH image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'hthigh', 'HTHIGH');
    },
};

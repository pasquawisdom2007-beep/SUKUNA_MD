'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'futa',
    description: 'Send an Anime NSFW FUTA image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'futa', 'FUTA');
    },
};

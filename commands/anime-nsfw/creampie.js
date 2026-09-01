'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'creampie',
    description: 'Send an Anime NSFW CREAMPIE image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'creampie', 'CREAMPIE');
    },
};

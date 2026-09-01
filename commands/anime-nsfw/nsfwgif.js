'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'nsfwgif',
    description: 'Send an Anime NSFW NSFWGIF image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'nsfwgif', 'NSFWGIF');
    },
};

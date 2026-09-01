'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'nsfwuniform',
    description: 'Send an Anime NSFW NSFWUNIFORM image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'nsfwuniform', 'NSFWUNIFORM');
    },
};

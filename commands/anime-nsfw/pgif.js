'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'pgif',
    description: 'Send an Anime NSFW PGIF image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'pgif', 'PGIF');
    },
};

'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'hboobs',
    description: 'Send an Anime NSFW HBOOBS image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'hboobs', 'HBOOBS');
    },
};

'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'gonewild',
    description: 'Send an Anime NSFW GONEWILD image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'gonewild', 'GONEWILD');
    },
};

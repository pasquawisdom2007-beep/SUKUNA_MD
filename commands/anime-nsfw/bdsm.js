'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'bdsm',
    description: 'Send an Anime NSFW BDSM image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'bdsm', 'BDSM');
    },
};

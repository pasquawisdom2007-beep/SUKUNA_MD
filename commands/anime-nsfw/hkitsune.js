'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'hkitsune',
    description: 'Send an Anime NSFW HKITSUNE image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'hkitsune', 'HKITSUNE');
    },
};

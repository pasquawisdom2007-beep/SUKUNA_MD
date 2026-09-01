'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'kemonomimi',
    description: 'Send an Anime NSFW KEMONOMIMI image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'kemonomimi', 'KEMONOMIMI');
    },
};

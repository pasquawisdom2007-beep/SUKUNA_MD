'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'hmidriff',
    description: 'Send an Anime NSFW HMIDRIFF image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'hmidriff', 'HMIDRIFF');
    },
};

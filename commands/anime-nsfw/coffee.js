'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'coffee',
    description: 'Send an Anime NSFW COFFEE image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'coffee', 'COFFEE');
    },
};

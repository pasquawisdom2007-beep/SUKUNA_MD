'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'hneko',
    description: 'Send an Anime NSFW HNEKO image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'hneko', 'HNEKO');
    },
};

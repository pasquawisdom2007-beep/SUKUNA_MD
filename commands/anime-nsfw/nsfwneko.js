'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'nsfwneko',
    description: 'Send an Anime NSFW NSFWNEKO image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'nsfwneko', 'NSFWNEKO');
    },
};

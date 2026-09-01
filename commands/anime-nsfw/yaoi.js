'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'yaoi',
    description: 'Send an Anime NSFW YAOI image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'yaoi', 'YAOI');
    },
};

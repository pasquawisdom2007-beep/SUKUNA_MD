'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'blowjob',
    description: 'Send an Anime NSFW BLOWJOB image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'blowjob', 'BLOWJOB');
    },
};

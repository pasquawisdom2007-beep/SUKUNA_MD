'use strict';
const { sendAnimeNsfw } = require('../../utils/animeNsfw');
module.exports = {
    name: 'tentacle',
    description: 'Send an Anime NSFW TENTACLE image (18+ only)',
    category: 'anime-nsfw',
    async execute(context) {
        return sendAnimeNsfw(context, 'tentacle', 'TENTACLE');
    },
};

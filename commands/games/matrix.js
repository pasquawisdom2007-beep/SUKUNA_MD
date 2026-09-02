'use strict';
const { sendArcade } = require('../../utils/arcadeGames');
module.exports = {
    name: 'matrix',
    aliases: ['matrixgame', 'spaceshooter', 'matrixgame'],
    description: 'Play Matrix, a neon space-shooter GenAI mini-game',
    category: 'games',
    async execute({ sock, msg, from, reply }) {
        try { return await sendArcade({ sock, msg, from, game: 'matrix' }); }
        catch (error) { console.error('[MATRIX GenAI]', error.message); return reply('Matrix could not open on this client. Please update WhatsApp and try again.'); }
    },
};

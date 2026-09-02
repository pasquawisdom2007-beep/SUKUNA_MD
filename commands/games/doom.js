'use strict';
const { sendArcade } = require('../../utils/arcadeGames');
module.exports = {
    name: 'doom',
    aliases: ['doomgame', 'redzone'],
    description: 'Play Doom, a red corridor shooter GenAI mini-game',
    category: 'games',
    async execute({ sock, msg, from, reply }) {
        try { return await sendArcade({ sock, msg, from, game: 'doom' }); }
        catch (error) { console.error('[DOOM GenAI]', error.message); return reply('Doom could not open on this client. Please update WhatsApp and try again.'); }
    },
};

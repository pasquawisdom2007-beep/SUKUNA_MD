'use strict';
const { sendArcade } = require('../../utils/arcadeGames');
module.exports = {
    name: 'vampire',
    aliases: ['vampiregame', 'nightvamp'],
    description: 'Play Vampire, a top-down survival GenAI mini-game',
    category: 'games',
    async execute({ sock, msg, from, reply }) {
        try { return await sendArcade({ sock, msg, from, game: 'vampire' }); }
        catch (error) { console.error('[VAMPIRE GenAI]', error.message); return reply('Vampire could not open on this client. Please update WhatsApp and try again.'); }
    },
};

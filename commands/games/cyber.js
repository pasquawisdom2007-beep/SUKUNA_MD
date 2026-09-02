'use strict';
const { sendArcade } = require('../../utils/arcadeGames');
module.exports = {
    name: 'cyber',
    aliases: ['cybergame', 'neonrunner', 'cyberrun'],
    description: 'Play Cyber, a neon city runner GenAI mini-game',
    category: 'games',
    async execute({ sock, msg, from, reply }) {
        try { return await sendArcade({ sock, msg, from, game: 'cyber' }); }
        catch (error) { console.error('[CYBER GenAI]', error.message); return reply('Cyber could not open on this client. Please update WhatsApp and try again.'); }
    },
};

'use strict';

const memory = require('../../utils/pasquaMemory');
const pasqua = require('./pasqua');

module.exports = {
    name: 'chatsummary',
    aliases: ['summary', 'summarizechat', 'chatmood', 'atmosphere'],
    description: 'Summarize recent chat context and describe its atmosphere',
    usage: '.chatsummary [short|detailed] | .atmosphere',
    category: 'ai',
    async execute({ from, sender, isGroup, args, reply, database }) {
        const chatKey = isGroup ? from : sender;
        const context = memory.getContext(database, chatKey, 60);
        if (!memory.isEnabled(database, chatKey)) return reply('🧠 Memory is OFF for this chat. Use .pasqua memory on first.');
        if (!context.messages.length) return reply('🧠 I have no recent chat messages stored yet.');

        const mode = String(args?.[0] || '').toLowerCase();
        if (mode === 'atmosphere' || mode === 'mood' || module.exports.name === 'atmosphere') {
            return reply(`🌡️ *Chat atmosphere:* ${context.atmosphere.label}\n\nI read the recent stored text only; media contents are not retained by memory.`);
        }

        const prompt = `Summarize the recent WhatsApp chat accurately. Separate decisions, requests, unresolved items, and important facts. Mention the overall atmosphere. Do not invent names or facts. ${mode === 'short' ? 'Keep it under 8 lines.' : 'Use clear headings and concise detail.'}`;
        const answer = await pasqua.getPasquaAIReply(prompt, `summary:${chatKey}`, { memoryContext: context });
        if (!answer) return reply(`🧠 *Recent chat atmosphere:* ${context.atmosphere.label}\n\nI could not reach the summarizer, but I have preserved the recent context.`);
        return reply(`🧠 *Chat summary*\n\n${answer}`);
    },
};

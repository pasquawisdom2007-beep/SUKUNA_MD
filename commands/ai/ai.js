/**
 * .ai <question> — General purpose AI assistant.
 * Multi-provider with keyless fallback via utils/smartAI.
 */
const { ask } = require('../../utils/smartAI');

module.exports = {
    name: 'aichat',
    aliases: ['genai', 'aibot', 'buddy', 'assistant'],
    description: 'General purpose AI assistant (multi-provider, keyless fallback)',
    category: 'ai',
    async execute({ reply, args, from, sender, isGroup }) {
        if (!args.length) {
            return reply('🤖 *AI Assistant*\n\nUsage: .aichat <question>\nExample: .aichat how do airplanes fly?');
        }
        const q = args.join(' ');
        await reply('🤖 *Thinking...*');
        const out = await ask({
            key: 'ai:' + (isGroup ? from : sender),
            system: 'You are a helpful, friendly WhatsApp AI assistant. Answer clearly and concisely.',
            user: q,
            remember: true,
        });
        if (!out) return reply('❌ AI is busy right now. Try again in a moment.');
        await reply(out);
    },
};

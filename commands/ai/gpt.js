/**
 * GPT Command — Chat with AI
 * Usage: .gpt <question>
 *
 * Routes through the shared multi-provider AI helper (Groq / Gemini / OpenAI /
 * OpenRouter / AI Gateway with a keyless Pollinations fallback) so it keeps
 * working even when individual providers are down or rate-limited.
 */

const { ask } = require('../../utils/smartAI');

module.exports = {
    name: 'gpt',
    aliases: ['ai', 'chatgpt', 'askai', 'bot'],
    description: 'Chat with AI',
    category: 'ai',
    async execute({ reply, args, from, sender, isGroup }) {
        if (!args.length) {
            return reply(
                `🤖 *AI Chat*\n\n` +
                `Usage: .gpt <your question>\n` +
                `Example: .gpt What is the meaning of life?`
            );
        }

        const prompt = args.join(' ');
        const key = 'gpt:' + (isGroup ? from : sender);

        try {
            await reply('🤖 *Thinking...*');
            const response = await ask({
                key,
                system: 'You are a helpful, concise AI assistant. Give accurate, useful answers.',
                user: prompt,
            });

            if (!response || !response.trim()) {
                return reply('❌ All AI providers are busy right now. Please try again in a moment.');
            }

            await reply(
                `🤖 *AI*\n\n` +
                `Q: ${prompt}\n\n` +
                `A: ${response}`
            );
        } catch (err) {
            await reply(`❌ AI service error: ${err.message || 'Please try again later.'}`);
        }
    }
};

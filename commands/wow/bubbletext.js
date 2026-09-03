module.exports = {
  name: "bubbletext",
  aliases: [],
  description: "SUKUNA wow utility: bubbletext",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('✨ .bubbletext is ready. Add text or options to explore it.'); } catch (error) { return reply('❌ bubbletext failed: ' + error.message); }
  }
};

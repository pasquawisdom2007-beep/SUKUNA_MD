module.exports = {
  name: "tinytext",
  aliases: [],
  description: "SUKUNA wow utility: tinytext",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('✨ .tinytext is ready. Add text or options to explore it.'); } catch (error) { return reply('❌ tinytext failed: ' + error.message); }
  }
};

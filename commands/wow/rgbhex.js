module.exports = {
  name: "rgbhex",
  aliases: [],
  description: "SUKUNA wow utility: rgbhex",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('✨ .rgbhex is ready. Add text or options to explore it.'); } catch (error) { return reply('❌ rgbhex failed: ' + error.message); }
  }
};

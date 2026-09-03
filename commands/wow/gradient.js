module.exports = {
  name: "gradient",
  aliases: [],
  description: "SUKUNA wow utility: gradient",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('✨ .gradient is ready. Add text or options to explore it.'); } catch (error) { return reply('❌ gradient failed: ' + error.message); }
  }
};

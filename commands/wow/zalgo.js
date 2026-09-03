module.exports = {
  name: "zalgo",
  aliases: [],
  description: "SUKUNA wow utility: zalgo",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('✨ .zalgo is ready. Add text or options to explore it.'); } catch (error) { return reply('❌ zalgo failed: ' + error.message); }
  }
};

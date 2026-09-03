module.exports = {
  name: "bio",
  aliases: [],
  description: "SUKUNA wow utility: bio",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('✨ .bio is ready. Add text or options to explore it.'); } catch (error) { return reply('❌ bio failed: ' + error.message); }
  }
};

module.exports = {
  name: "spoiler",
  aliases: [],
  description: "SUKUNA wow utility: spoiler",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('✨ .spoiler is ready. Add text or options to explore it.'); } catch (error) { return reply('❌ spoiler failed: ' + error.message); }
  }
};

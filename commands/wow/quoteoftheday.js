module.exports = {
  name: "quoteoftheday",
  aliases: [],
  description: "SUKUNA wow utility: quoteoftheday",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('📜 The secret of getting ahead is getting started.'); } catch (error) { return reply('❌ quoteoftheday failed: ' + error.message); }
  }
};

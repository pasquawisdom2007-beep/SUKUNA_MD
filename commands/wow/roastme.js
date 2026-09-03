module.exports = {
  name: "roastme",
  aliases: [],
  description: "SUKUNA wow utility: roastme",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('🔥 You have great potential — it is just waiting for your Wi‑Fi signal to improve.'); } catch (error) { return reply('❌ roastme failed: ' + error.message); }
  }
};

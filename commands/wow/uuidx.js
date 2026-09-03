module.exports = {
  name: "uuidx",
  aliases: [],
  description: "SUKUNA wow utility: uuidx",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const crypto=require('crypto'); return reply('🆔 '+crypto.randomUUID()); } catch (error) { return reply('❌ uuidx failed: ' + error.message); }
  }
};

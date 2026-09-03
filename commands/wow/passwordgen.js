module.exports = {
  name: "passwordgen",
  aliases: [],
  description: "SUKUNA wow utility: passwordgen",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const crypto=require('crypto'); const n=Math.min(Math.max(parseInt(args[0])||16,8),64); return reply('🔑 '+crypto.randomBytes(n).toString('base64url').slice(0,n)); } catch (error) { return reply('❌ passwordgen failed: ' + error.message); }
  }
};

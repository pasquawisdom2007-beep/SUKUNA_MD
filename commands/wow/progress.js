module.exports = {
  name: "progress",
  aliases: [],
  description: "SUKUNA wow utility: progress",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const n=Math.min(Math.max(parseInt(args[0])||50,0),100); return reply('['+'█'.repeat(Math.floor(n/10))+'░'.repeat(10-Math.floor(n/10))+'] '+n+'%'); } catch (error) { return reply('❌ progress failed: ' + error.message); }
  }
};

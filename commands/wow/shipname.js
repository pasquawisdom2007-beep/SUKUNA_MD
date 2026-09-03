module.exports = {
  name: "shipname",
  aliases: [],
  description: "SUKUNA wow utility: shipname",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const a=args[0]||'Sukuna',b=args[1]||'User'; return reply('💞 '+a.slice(0,Math.ceil(a.length/2))+b.slice(Math.floor(b.length/2))); } catch (error) { return reply('❌ shipname failed: ' + error.message); }
  }
};

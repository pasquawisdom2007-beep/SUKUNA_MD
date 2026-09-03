module.exports = {
  name: "textcase",
  aliases: [],
  description: "SUKUNA wow utility: textcase",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const t=args.join(' '); return reply(t ? '🔤 UPPER: '+t.toUpperCase()+'\n🔡 lower: '+t.toLowerCase()+'\n✨ Title: '+t.replace(/\b\w/g,c=>c.toUpperCase()) : 'Usage: .textcase text'); } catch (error) { return reply('❌ textcase failed: ' + error.message); }
  }
};

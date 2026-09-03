module.exports = {
  name: "alternating",
  aliases: [],
  description: "SUKUNA wow utility: alternating",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const t=args.join(' '); return reply(t ? [...t].map((c,i)=>i%2?c.toLowerCase():c.toUpperCase()).join('') : 'Usage: .alternating text'); } catch (error) { return reply('❌ alternating failed: ' + error.message); }
  }
};

module.exports = {
  name: "scramble",
  aliases: [],
  description: "SUKUNA wow utility: scramble",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const t=args.join(' '); return reply(t ? [...t].sort(()=>Math.random()-.5).join('') : 'Usage: .scramble text'); } catch (error) { return reply('❌ scramble failed: ' + error.message); }
  }
};

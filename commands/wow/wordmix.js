module.exports = {
  name: "wordmix",
  aliases: [],
  description: "SUKUNA wow utility: wordmix",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const a=args.filter(Boolean); return reply(a.length ? '🌀 '+a.sort(()=>Math.random()-.5).join(' ') : 'Usage: .wordmix words here'); } catch (error) { return reply('❌ wordmix failed: ' + error.message); }
  }
};

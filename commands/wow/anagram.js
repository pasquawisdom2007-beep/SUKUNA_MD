module.exports = {
  name: "anagram",
  aliases: [],
  description: "SUKUNA wow utility: anagram",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const t=args.join('').replace(/\s/g,''); return reply(t ? '🔀 '+[...t].sort(()=>Math.random()-.5).join('') : 'Usage: .anagram word'); } catch (error) { return reply('❌ anagram failed: ' + error.message); }
  }
};

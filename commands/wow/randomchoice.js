module.exports = {
  name: "randomchoice",
  aliases: [],
  description: "SUKUNA wow utility: randomchoice",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const a=args.filter(Boolean); return reply(a.length ? '🎲 '+a[Math.floor(Math.random()*a.length)] : 'Usage: .randomchoice red blue green'); } catch (error) { return reply('❌ randomchoice failed: ' + error.message); }
  }
};

module.exports = {
  name: "pick",
  aliases: [],
  description: "SUKUNA wow utility: pick",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const a=args.filter(Boolean); return reply(a.length ? '🎯 I pick: '+a[Math.floor(Math.random()*a.length)] : 'Usage: .pick option1 option2'); } catch (error) { return reply('❌ pick failed: ' + error.message); }
  }
};

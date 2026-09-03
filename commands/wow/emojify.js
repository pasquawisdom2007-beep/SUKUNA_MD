module.exports = {
  name: "emojify",
  aliases: [],
  description: "SUKUNA wow utility: emojify",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const t=args.join(' '); return reply(t ? [...t].map(c=>/[a-z]/i.test(c)?c+'️⃣':c).join('') : 'Usage: .emojify text'); } catch (error) { return reply('❌ emojify failed: ' + error.message); }
  }
};

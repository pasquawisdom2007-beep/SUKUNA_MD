module.exports = {
  name: "loveletter",
  aliases: [],
  description: "SUKUNA wow utility: loveletter",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const n=args.join(' ')||'you'; return reply('💌 Dear '+n+',\nYou make the world feel a little brighter. Keep being wonderfully you.'); } catch (error) { return reply('❌ loveletter failed: ' + error.message); }
  }
};

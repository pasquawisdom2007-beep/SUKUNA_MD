module.exports = {
  name: "ordinal",
  aliases: [],
  description: "SUKUNA wow utility: ordinal",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const n=parseInt(args[0]); if(!Number.isFinite(n)) return reply('Usage: .ordinal number'); const s=['th','st','nd','rd'],v=n%100; return reply(n+(s[(v-20)%10]||s[v]||s[0])); } catch (error) { return reply('❌ ordinal failed: ' + error.message); }
  }
};

module.exports = {
  name: "bargraph",
  aliases: [],
  description: "SUKUNA wow utility: bargraph",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const n=Math.min(Math.max(parseInt(args[0])||5,0),20); return reply('📊 '+'▮'.repeat(n)+'▯'.repeat(20-n)); } catch (error) { return reply('❌ bargraph failed: ' + error.message); }
  }
};

module.exports = {
  name: "colorinfo",
  aliases: [],
  description: "SUKUNA wow utility: colorinfo",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const c=(args[0]||'').replace('#',''); if(!/^[0-9a-f]{6}$/i.test(c)) return reply('Usage: .colorinfo #ff0055'); const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4),16); return reply('🎨 RGB: '+r+', '+g+', '+b+'\nHex: #'+c.toUpperCase()); } catch (error) { return reply('❌ colorinfo failed: ' + error.message); }
  }
};

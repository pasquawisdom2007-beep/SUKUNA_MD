module.exports = {
  name: "neverhavei",
  aliases: [],
  description: "SUKUNA wow utility: neverhavei",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const qs=['Never have I ever sent a message to the wrong person.','Never have I ever laughed at the worst time.','Never have I ever stayed awake all night.']; return reply('🙈 '+qs[Math.floor(Math.random()*qs.length)]); } catch (error) { return reply('❌ neverhavei failed: ' + error.message); }
  }
};

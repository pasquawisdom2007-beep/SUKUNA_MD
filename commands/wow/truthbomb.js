module.exports = {
  name: "truthbomb",
  aliases: [],
  description: "SUKUNA wow utility: truthbomb",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const qs=['Small consistent steps beat rare bursts of motivation.','Your future self is built by today’s habits.','Clarity often comes after starting, not before.']; return reply('💥 '+qs[Math.floor(Math.random()*qs.length)]); } catch (error) { return reply('❌ truthbomb failed: ' + error.message); }
  }
};

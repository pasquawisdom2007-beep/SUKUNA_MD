module.exports = {
  name: "trivia",
  aliases: [],
  description: "SUKUNA wow utility: trivia",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const qs=['What planet is known as the Red Planet? — Mars.','How many sides has a hexagon? — Six.','What is the largest ocean? — Pacific.']; return reply('🧠 '+qs[Math.floor(Math.random()*qs.length)]); } catch (error) { return reply('❌ trivia failed: ' + error.message); }
  }
};

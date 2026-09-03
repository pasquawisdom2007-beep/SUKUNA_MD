module.exports = {
  name: "motd",
  aliases: [],
  description: "SUKUNA wow utility: motd",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('📣 Message of the day: Build boldly, help others, and keep moving.'); } catch (error) { return reply('❌ motd failed: ' + error.message); }
  }
};

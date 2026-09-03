module.exports = {
  name: "myid",
  aliases: [],
  description: "SUKUNA wow utility: myid",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('🪪 Your sender ID: ' + (sender || from)); } catch (error) { return reply('❌ myid failed: ' + error.message); }
  }
};

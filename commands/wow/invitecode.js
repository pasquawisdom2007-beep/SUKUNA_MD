module.exports = {
  name: "invitecode",
  aliases: [],
  description: "SUKUNA wow utility: invitecode",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('🔗 Group invite tools are available through the group admin menu.'); } catch (error) { return reply('❌ invitecode failed: ' + error.message); }
  }
};

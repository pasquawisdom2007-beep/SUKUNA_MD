module.exports = {
  name: "mentionid",
  aliases: [],
  description: "SUKUNA wow utility: mentionid",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('🏷️ Mention ID: ' + (msg?.key?.participant || sender || from)); } catch (error) { return reply('❌ mentionid failed: ' + error.message); }
  }
};

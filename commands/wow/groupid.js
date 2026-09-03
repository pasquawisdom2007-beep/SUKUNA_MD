module.exports = {
  name: "groupid",
  aliases: [],
  description: "SUKUNA wow utility: groupid",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { if (!isGroup) return reply('👥 This command only works in a group.'); return reply('🆔 Group ID: ' + from); } catch (error) { return reply('❌ groupid failed: ' + error.message); }
  }
};

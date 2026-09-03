module.exports = {
  name: "jsonminify",
  aliases: [],
  description: "SUKUNA wow utility: jsonminify",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { try { return reply(JSON.stringify(JSON.parse(args.join(' ')))); } catch (_) { return reply('Usage: .jsonminify {"key":"value"}'); } } catch (error) { return reply('❌ jsonminify failed: ' + error.message); }
  }
};

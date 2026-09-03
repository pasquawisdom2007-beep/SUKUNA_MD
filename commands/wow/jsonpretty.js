module.exports = {
  name: "jsonpretty",
  aliases: [],
  description: "SUKUNA wow utility: jsonpretty",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { try { return reply(JSON.stringify(JSON.parse(args.join(' ')), null, 2)); } catch (_) { return reply('Usage: .jsonpretty {"key":"value"}'); } } catch (error) { return reply('❌ jsonpretty failed: ' + error.message); }
  }
};

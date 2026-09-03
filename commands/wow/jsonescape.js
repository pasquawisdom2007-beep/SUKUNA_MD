module.exports = {
  name: "jsonescape",
  aliases: [],
  description: "SUKUNA wow utility: jsonescape",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply(JSON.stringify(args.join(' '))); } catch (error) { return reply('❌ jsonescape failed: ' + error.message); }
  }
};

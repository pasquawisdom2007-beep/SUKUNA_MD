module.exports = {
  name: "deviceinfo",
  aliases: [],
  description: "SUKUNA wow utility: deviceinfo",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('📱 Platform: '+process.platform+'\nNode: '+process.version+'\nArch: '+process.arch); } catch (error) { return reply('❌ deviceinfo failed: ' + error.message); }
  }
};

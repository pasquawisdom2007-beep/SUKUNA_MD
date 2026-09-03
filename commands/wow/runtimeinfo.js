module.exports = {
  name: "runtimeinfo",
  aliases: [],
  description: "SUKUNA wow utility: runtimeinfo",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('⏱️ Runtime: '+Math.floor(process.uptime())+' seconds\nMemory: '+Math.round(process.memoryUsage().rss/1024/1024)+' MB'); } catch (error) { return reply('❌ runtimeinfo failed: ' + error.message); }
  }
};

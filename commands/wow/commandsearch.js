module.exports = {
  name: "commandsearch",
  aliases: [],
  description: "SUKUNA wow utility: commandsearch",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const q=(args[0]||'').toLowerCase(); const loader=require('../../utils/commandLoader'); const names=loader.getAll().map(c=>c.name).filter(n=>!q||n.includes(q)).slice(0,40); return reply(names.length?'🔎 '+names.join(', '):'No matching commands.'); } catch (error) { return reply('❌ commandsearch failed: ' + error.message); }
  }
};

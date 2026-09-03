module.exports = {
  name: "categorylist",
  aliases: [],
  description: "SUKUNA wow utility: categorylist",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const loader=require('../../utils/commandLoader'); const cats=[...new Set(loader.getAll().map(c=>c.category))]; return reply('🗂️ '+cats.join('\n')); } catch (error) { return reply('❌ categorylist failed: ' + error.message); }
  }
};

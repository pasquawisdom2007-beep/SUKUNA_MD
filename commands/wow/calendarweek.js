module.exports = {
  name: "calendarweek",
  aliases: [],
  description: "SUKUNA wow utility: calendarweek",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { const d=new Date(); const one=new Date(d.getFullYear(),0,1); return reply('📅 Week '+Math.ceil((((d-one)/86400000)+one.getDay()+1)/7)); } catch (error) { return reply('❌ calendarweek failed: ' + error.message); }
  }
};

module.exports = {
  name: "quotedid",
  aliases: [],
  description: "SUKUNA wow utility: quotedid",
  async execute({ reply, args = [], from, sender, msg, isGroup }) {
    try { return reply('💬 Quoted message ID: ' + (msg?.message?.extendedTextMessage?.contextInfo?.stanzaId || 'No quoted message found.')); } catch (error) { return reply('❌ quotedid failed: ' + error.message); }
  }
};

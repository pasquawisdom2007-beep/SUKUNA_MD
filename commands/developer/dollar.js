'use strict';
const { runDeveloperCode } = require('../../utils/developerRuntime');
module.exports = {
    name: '$', aliases: ['sock'], description: 'Run developer JavaScript with sock, m, jid, and reply in scope', usage: '$ await sock.sendMessage(jid, { text: "hello" })', category: 'developer',
    async execute({ args, sock, msg, m, from, sender, phoneNumber, reply, database, isOwner, isMod }) {
        if (!isOwner && !isMod) return reply('🔒 Developer tools are restricted to the bot owner and authorized moderators.');
        const result = await runDeveloperCode({ mode: 'eval', code: args.join(' '), sock, msg, m, from, sender, phoneNumber, reply, database });
        return reply(result.ok ? `✅ *DEV RESULT*\n\n${result.output || 'undefined'}` : `❌ *DEV ERROR*\n\n${result.error}`, { raw: true });
    },
};

'use strict';
const { runDeveloperCode } = require('../../utils/developerRuntime');
async function executeDeveloper({ mode, args, sock, msg, m, from, sender, phoneNumber, reply, database, isOwner, isMod }) {
    if (!isOwner && !isMod) return reply('🔒 Developer tools are restricted to the bot owner and authorized moderators.');
    const result = await runDeveloperCode({ mode, code: args.join(' '), sock, msg, m, from, sender, phoneNumber, reply, database });
    return reply(result.ok ? `✅ *DEV RESULT*\n\n${result.output || 'undefined'}` : `❌ *DEV ERROR*\n\n${result.error}`, { raw: true });
}
module.exports = {
    name: 'eval', aliases: ['js', 'javascript'], description: 'Evaluate protected developer JavaScript', usage: '.eval <JavaScript>', category: 'developer',
    async execute(context) { return executeDeveloper({ ...context, mode: 'eval' }); },
};

'use strict';
module.exports = {
    name: 'devtools', aliases: ['developer', 'devhelp'], description: 'Show protected developer tools', usage: '.devtools', category: 'developer',
    async execute({ reply, isOwner, isMod }) {
        if (!isOwner && !isMod) return reply('🔒 Developer tools are restricted to the bot owner and authorized moderators.');
        return reply(
            '*DEVELOPER TOOLS*\n\n' +
            'No-prefix code (owner/mod only):\n' +
            '• `$ await sock.sendMessage(jid, { text: "hello" })`\n' +
            '• `$ await sock.sendRichHtmlMessage(jid, { title: "Test", html: "<h1>Hello</h1>", url: "https://pair.crysnovax.link", trustedSources: ["crysnovax.link"] })`\n' +
            '• `$ sock.sendMiniApp(jid, { title: "Run test now!" })`\n\n' +
            'Prefixed tools:\n' +
            '• `.eval <JavaScript>`\n' +
            '• `.const name = expression`\n' +
            '• `.$ <JavaScript>` / `.sock <JavaScript>`\n\n' +
            'Available: `sock`, `m`, `msg`, `jid`, `from`, `sender`, `reply`, `database`, `sendRichHtmlMessage`, `sendMiniApp`.\n' +
            'Module loading, process access, shell execution, and filesystem deletion are blocked.'
        );
    },
};

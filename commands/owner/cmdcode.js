'use strict';
const fs = require('fs');
const path = require('path');
const commandLoader = require('../../utils/commandLoader');
const pluginRegistry = require('../../utils/pluginRegistry');

function cleanName(value) {
    return String(value || '').trim().toLowerCase().replace(/^\./, '');
}
function getSource(name) {
    const command = commandLoader.getCommand(name);
    if (!command) return null;
    if (command.category === 'plugin') {
        const plugin = pluginRegistry.list().find(item => item.name === command.name);
        return plugin ? { command, source: plugin.code, label: `plugin:${command.name}` } : null;
    }
    const sourcePath = command.sourcePath;
    if (!sourcePath || !path.resolve(sourcePath).startsWith(path.resolve(path.join(__dirname, '..', '..', 'commands')))) return null;
    try {
        return { command, source: fs.readFileSync(sourcePath, 'utf8'), label: sourcePath.split('/commands/').pop() };
    } catch (_) {
        return null;
    }
}

module.exports = {
    name: 'cmdcode',
    aliases: ['commandcode', 'getcode', 'source'],
    description: 'Retrieve the source code of a loaded command',
    usage: '.cmdcode <command-name>',
    category: 'owner',
    ownerOnly: true,
    async execute({ args = [], reply, sock, msg, from, isOwner, isMod }) {
        if (!isOwner && !isMod) return reply('🔒 Only the owner or an authorized moderator can retrieve command code.');
        const name = cleanName(args[0]);
        if (!name) return reply('Usage: `.cmdcode <command-name>`\nExample: `.cmdcode gcstatus`');
        const result = getSource(name);
        if (!result) return reply(`❌ No loaded command named *${name}* was found.`);
        const source = String(result.source || '');
        const caption = `🧩 ${result.label}\n${source.length.toLocaleString()} characters`;
        if (source.length <= 3500) {
            return reply(`📄 *${result.label}*\n\n\`\`\`javascript\n${source}\n\`\`\`` , { raw: true });
        }
        if (!sock || !from) return reply('❌ The command is too large to send as text.');
        return sock.sendMessage(from, {
            document: Buffer.from(source, 'utf8'),
            mimetype: 'text/javascript',
            fileName: result.label.split('/').pop() || `${name}.js`,
            caption,
        }, msg?.key ? { quoted: msg } : undefined);
    },
    _private: { cleanName, getSource },
};

'use strict';
const pluginRegistry = require('../../utils/pluginRegistry');
const commandLoader = require('../../utils/commandLoader');

async function readExternal(source) {
    const url = new URL(source);
    if (url.protocol !== 'https:') throw new Error('External plugin sources must use HTTPS.');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'text/plain, application/json' } });
    if (!response.ok) throw new Error(`External source returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > pluginRegistry.MAX_SOURCE) throw new Error(`External code is limited to ${pluginRegistry.MAX_SOURCE} characters.`);
    try {
        const json = JSON.parse(text);
        return String(json.code || json.source || '').trim();
    } catch (_) {
        return text.trim();
    }
}
function help(prefix) {
    return `🧩 *PLUGIN COMMANDS*\n\n` +
        `• ${prefix}plugin add <name> <code>\n` +
        `• ${prefix}plugin add <name> https://example.com/plugin.txt\n` +
        `• ${prefix}plugin list\n` +
        `• ${prefix}plugin remove <name>\n\n` +
        `Plugin code runs in a restricted sandbox with: sock, msg, m, from, sender, args, reply and database.`;
}
module.exports = {
    name: 'plugin',
    aliases: ['plugins'],
    description: 'Install, list and remove sandboxed custom commands',
    usage: '.plugin add <name> <code|https-url>',
    category: 'owner',
    ownerOnly: true,
    async execute({ args = [], prefix = '.', reply, isOwner, isMod }) {
        if (!isOwner && !isMod) return reply('🔒 Only the owner or an authorized moderator can manage plugins.');
        const action = String(args[0] || 'list').toLowerCase();
        if (action === 'list') {
            const plugins = pluginRegistry.list();
            return reply(plugins.length ? `🧩 *PLUGINS*\n\n${plugins.map(p => `• *${p.name}* — ${p.description || 'custom command'}`).join('\n')}` : '🧩 No custom plugins installed.');
        }
        if (action === 'remove' || action === 'delete') {
            const name = args[1];
            if (!name) return reply(help(prefix));
            const removed = pluginRegistry.remove(name);
            if (removed) commandLoader.unregisterPlugin(name);
            return reply(removed ? `✅ Plugin *${String(name).toLowerCase()}* removed.` : `❌ Plugin *${name}* was not found.`);
        }
        if (action !== 'add' && action !== 'install') return reply(help(prefix));
        const name = args[1];
        const source = args.slice(2).join(' ').trim();
        if (!name || !source) return reply(help(prefix));
        try {
            if (commandLoader.getCommand(String(name).toLowerCase()) && !commandLoader.getPlugins().some(p => p.name === String(name).toLowerCase())) {
                return reply(`❌ *${String(name).toLowerCase()}* already exists as a built-in command. Choose another name.`);
            }
            const code = /^https:\/\//i.test(source) ? await readExternal(source) : source;
            const plugin = pluginRegistry.save(name, code);
            commandLoader.unregisterPlugin(plugin.name);
            const registered = commandLoader.registerPlugin({ name: plugin.name, description: plugin.description, execute: async context => {
                const { runDeveloperCode } = require('../../utils/developerRuntime');
                const result = await runDeveloperCode({ ...context, code: plugin.code, mode: 'eval' });
                if (!result.ok) return context.reply(`❌ Plugin ${plugin.name} failed: ${result.error}`, { raw: true });
                if (result.output && result.output !== 'undefined') return context.reply(result.output, { raw: true });
            }});
            return reply(registered ? `✅ Plugin *${plugin.name}* installed. Try *${prefix}${plugin.name}* now.` : '❌ Plugin could not be registered.');
        } catch (error) {
            return reply(`❌ Plugin rejected: ${error.message}`, { raw: true });
        }
    },
};

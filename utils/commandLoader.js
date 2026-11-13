/**
 * Command Loader - Loads all WhatsApp commands
 */

const fs = require('fs');
const path = require('path');

class CommandLoader {
    constructor() {
        this.commands = new Map();
        this.aliases = new Map();
        this.plugins = new Map();
    }

    loadCommands() {
        const commandsDir = path.join(__dirname, '..', 'commands');
        const categories = fs.readdirSync(commandsDir).filter(f =>
            fs.statSync(path.join(commandsDir, f)).isDirectory()
        );

        for (const category of categories) {
            this.loadFromDir(path.join(commandsDir, category), category);
        }

        this.loadPlugins();

        console.log(`[LOADER] Loaded ${this.commands.size} commands across ${categories.length} categories`);
        return this.commands;
    }

    loadPlugins() {
        try {
            const registry = require('./pluginRegistry');
            for (const plugin of registry.load()) this.registerPlugin(plugin);
        } catch (error) {
            console.error('[LOADER] Plugin registry unavailable:', error.message);
        }
    }

    registerPlugin(plugin) {
        if (!plugin || !plugin.name || typeof plugin.execute !== 'function') return false;
        const name = String(plugin.name).toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name) || this.commands.has(name)) return false;
        const command = { ...plugin, name, category: 'plugin' };
        this.commands.set(name, command);
        for (const alias of Array.isArray(command.aliases) ? command.aliases : []) {
            const clean = String(alias).toLowerCase();
            if (/^[a-z0-9][a-z0-9_-]{0,31}$/.test(clean) && !this.commands.has(clean)) this.aliases.set(clean, name);
        }
        this.plugins.set(name, command);
        return true;
    }

    unregisterPlugin(name) {
        const clean = String(name || '').toLowerCase();
        const command = this.plugins.get(clean);
        if (!command) return false;
        this.commands.delete(clean);
        for (const [alias, target] of this.aliases) if (target === clean) this.aliases.delete(alias);
        this.plugins.delete(clean);
        return true;
    }

    getPlugins() { return Array.from(this.plugins.values()); }

    loadFromDir(dir, category) {
        if (!fs.existsSync(dir)) return;

        const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

        for (const file of files) {
            try {
                const filePath = path.join(dir, file);
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);

                if (command.name) {
                    command.category = category;
                    command.sourcePath = filePath;
                    this.commands.set(command.name, command);

                    if (command.aliases && Array.isArray(command.aliases)) {
                        for (const alias of command.aliases) {
                            this.aliases.set(alias, command.name);
                        }
                    }
                }
            } catch (error) {
                console.error(`[LOADER] Error loading ${file}:`, error.message);
            }
        }
    }

    getCommand(name) {
        if (this.commands.has(name)) return this.commands.get(name);
        if (this.aliases.has(name)) return this.commands.get(this.aliases.get(name));
        return null;
    }

    getAllCommands() {
        return this.commands;
    }

    // Array form — used by sessionManager.js's listener loop
    // (`for (const cmd of commandLoader.getAll())`), which needs
    // command objects directly rather than a Map's [key, value] pairs.
    getAll() {
        return Array.from(this.commands.values());
    }

    getCommandsByCategory(category) {
        const result = [];
        for (const [name, cmd] of this.commands) {
            if (cmd.category === category) result.push({ name, ...cmd });
        }
        return result;
    }
}

module.exports = new CommandLoader();

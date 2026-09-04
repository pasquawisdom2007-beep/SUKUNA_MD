'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'commands');
const names = new Map();
const aliases = new Map();
const errors = [];

for (const category of fs.readdirSync(root)) {
    const dir = path.join(root, category);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.js'))) {
        const full = path.join(dir, file);
        try {
            delete require.cache[require.resolve(full)];
            const command = require(full);
            if (!command?.name) continue;
            if (names.has(command.name)) errors.push(`duplicate name ${command.name}: ${names.get(command.name)} / ${full}`);
            names.set(command.name, full);
            for (const alias of command.aliases || []) {
                if (aliases.has(alias)) errors.push(`duplicate alias ${alias}: ${aliases.get(alias)} / ${full}`);
                aliases.set(alias, full);
                if (names.has(alias)) errors.push(`alias/name collision ${alias}: ${full} / ${names.get(alias)}`);
            }
        } catch (error) {
            errors.push(`load failure ${full}: ${error.message}`);
        }
    }
}

console.log(JSON.stringify({
    commandFiles: [...names.values()].length,
    uniqueNames: names.size,
    aliases: aliases.size,
    errors,
}, null, 2));
if (errors.length) process.exitCode = 1;

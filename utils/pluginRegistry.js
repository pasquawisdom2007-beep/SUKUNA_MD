'use strict';
const fs = require('fs');
const path = require('path');
const { runDeveloperCode } = require('./developerRuntime');

const FILE = path.join(__dirname, '..', 'data', 'plugins.json');
const MAX_SOURCE = 12000;
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

function ensureFile() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}\n');
}
function read() {
    ensureFile();
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) { return {}; }
}
function write(value) {
    ensureFile();
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, FILE);
}
function validate(name, code) {
    const clean = String(name || '').trim().toLowerCase();
    const source = String(code || '').trim();
    if (!NAME_RE.test(clean)) throw new Error('Command names may contain only letters, numbers, _ and - (max 32 characters).');
    if (!source) throw new Error('Plugin code is empty.');
    if (source.length > MAX_SOURCE) throw new Error(`Plugin code is limited to ${MAX_SOURCE} characters.`);
    return { name: clean, code: source };
}
function save(name, code, meta = {}) {
    const plugin = validate(name, code);
    const all = read();
    all[plugin.name] = { ...plugin, description: String(meta.description || `Custom ${plugin.name} command`).slice(0, 120), updatedAt: new Date().toISOString() };
    write(all);
    return all[plugin.name];
}
function remove(name) {
    const all = read();
    const clean = String(name || '').trim().toLowerCase();
    if (!all[clean]) return false;
    delete all[clean];
    write(all);
    return true;
}
function list() { return Object.values(read()); }
function load() {
    return list().map(plugin => ({
        name: plugin.name,
        description: plugin.description,
        usage: `.${plugin.name}`,
        execute: async context => {
            const result = await runDeveloperCode({ ...context, code: plugin.code, mode: 'eval' });
            if (!result.ok) return context.reply(`❌ Plugin ${plugin.name} failed: ${result.error}`, { raw: true });
            if (result.output && result.output !== 'undefined') return context.reply(result.output, { raw: true });
            return result.output;
        },
    }));
}
module.exports = { FILE, MAX_SOURCE, validate, save, remove, list, load };

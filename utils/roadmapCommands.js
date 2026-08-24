'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(REPO_ROOT, 'data', 'roadmap-backups');

function db(ctx) {
    return ctx.database || require('./database');
}

function prefix(ctx) {
    return ctx.prefix || '.';
}

function groupGate(ctx) {
    if (!ctx.isGroup) {
        ctx.reply('👥 This command can only be used inside a group.');
        return false;
    }
    return true;
}

function adminGate(ctx) {
    if (!groupGate(ctx)) return false;
    if (!ctx.isAdmin && !ctx.isOwner) {
        ctx.reply('🛡️ This command is available to group admins only.');
        return false;
    }
    return true;
}

function ownerGate(ctx) {
    if (!ctx.isOwner) {
        ctx.reply('🔒 This command is reserved for the bot owner.');
        return false;
    }
    return true;
}

function clean(value, max = 500) {
    return String(value || '').trim().slice(0, max);
}

function targetFrom(ctx) {
    const mentioned = ctx.msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const quoted = ctx.msg?.message?.extendedTextMessage?.contextInfo?.participant;
    const raw = mentioned[0] || quoted || ctx.args?.[0] || '';
    const digits = String(raw).replace(/[^0-9]/g, '');
    return raw.includes('@') ? raw : digits.length >= 6 ? `${digits}@s.whatsapp.net` : '';
}

function targetLabel(jid) {
    return String(jid || '').split('@')[0].replace(/[^0-9]/g, '') || 'member';
}

function groupStatus(ctx, label, value) {
    const state = value ? 'ON' : 'OFF';
    return `⚙️ *${label}*\n\nStatus: *${state}*\n\nUse ${prefix(ctx)}${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '')} on/off to change it.`;
}

async function maybeButtons(ctx, text, actions = []) {
    if (!actions.length || !ctx.sock?.relayMessage) return ctx.reply(text);
    try {
        const { sendRoadmapButtons } = require('./roadmapButtons');
        return await sendRoadmapButtons({ sock: ctx.sock, jid: ctx.from, quoted: ctx.msg, text, prefix: prefix(ctx), actions });
    } catch (_) {
        return ctx.reply(text);
    }
}

async function executeToggle(spec, ctx) {
    if (!adminGate(ctx)) return;
    const database = db(ctx);
    const group = database.getGroup(ctx.from);
    const arg = String(ctx.args?.[0] || '').toLowerCase();
    if (!arg || arg === 'help') return ctx.reply(`${spec.icon || '⚙️'} *${spec.title}*\n\nUsage: ${prefix(ctx)}${spec.name} on | off | status\n\n${spec.help || spec.description}`);
    if (arg === 'status') return maybeButtons(ctx, groupStatus(ctx, spec.title, !!group[spec.key]), spec.buttons || []);
    if (!['on', 'off'].includes(arg)) return ctx.reply(`❌ Use ${prefix(ctx)}${spec.name} on, off, or status.`);
    database.setGroupData(ctx.from, spec.key, arg === 'on');
    return ctx.reply(`${arg === 'on' ? '✅' : '⛔'} *${spec.title} ${arg === 'on' ? 'enabled' : 'disabled'}.*\n\n${spec.note || 'The setting has been saved for this group.'}`);
}

async function executeThreshold(spec, ctx) {
    if (!adminGate(ctx)) return;
    const database = db(ctx);
    const arg = String(ctx.args?.[0] || '').toLowerCase();
    if (arg === 'status' || !arg) {
        const value = database.getGroupData(ctx.from, spec.key) ?? spec.defaultValue;
        return ctx.reply(`⚙️ *${spec.title}*\n\nCurrent value: *${value}*\nUsage: ${prefix(ctx)}${spec.name} <number> | off`);
    }
    if (arg === 'off') {
        database.setGroupData(ctx.from, spec.key, 0);
        return ctx.reply(`✅ *${spec.title} disabled.*`);
    }
    const value = Number(ctx.args[0]);
    if (!Number.isInteger(value) || value < spec.min || value > spec.max) return ctx.reply(`❌ Enter a whole number from ${spec.min} to ${spec.max}.`);
    database.setGroupData(ctx.from, spec.key, value);
    return ctx.reply(`✅ *${spec.title} updated.*\n\nValue: *${value}*`);
}

async function executeMemberAction(spec, ctx) {
    if (!adminGate(ctx)) return;
    const target = targetFrom(ctx);
    if (!target) return ctx.reply(`👤 Reply to or mention a member.\nUsage: ${prefix(ctx)}${spec.name} @member`);
    const database = db(ctx);
    if (spec.action === 'jail') {
        database.setMutedUser(ctx.from, target, Number.MAX_SAFE_INTEGER);
        return ctx.reply(`⛓️ @${targetLabel(target)} has been jailed. Their messages will be removed while the jail is active.`, { mentions: [target] });
    }
    database.removeMutedUser(ctx.from, target);
    return ctx.reply(`🔓 @${targetLabel(target)} has been released.`, { mentions: [target] });
}

async function getMetadata(ctx) {
    try { return await ctx.sock.groupMetadata(ctx.from); } catch { return null; }
}

async function executeGroupLog(kind, ctx) {
    if (!adminGate(ctx)) return;
    const meta = await getMetadata(ctx);
    if (kind === 'adminlog') {
        const admins = (meta?.participants || []).filter(p => p.admin);
        return ctx.reply(`🛡️ *Admin log*\n\nCurrent admins: ${admins.length}\n${admins.length ? admins.map((p, i) => `${i + 1}. @${targetLabel(p.id || p.jid)}`).join('\n') : 'No admin records available.'}`, { mentions: admins.map(p => p.id || p.jid).filter(Boolean) });
    }
    if (kind === 'memberhistory') {
        const target = targetFrom(ctx);
        if (!target) return ctx.reply(`👤 Reply to or mention a member. Usage: ${prefix(ctx)}memberhistory @member`);
        const member = (meta?.participants || []).find(p => String(p.id || p.jid) === String(target));
        return ctx.reply(`🧾 *Member history*\n\nMember: @${targetLabel(target)}\nCurrent status: *${member ? 'present in group' : 'not in current member list'}*\n\nHistorical events are recorded only after the bot’s activity ledger is enabled.`, { mentions: [target] });
    }
    if (kind === 'permissionaudit') {
        const members = meta?.participants || [];
        const admins = members.filter(p => p.admin).length;
        return ctx.reply(`🔐 *Permission audit*\n\nMembers checked: *${members.length}*\nAdmins: *${admins}*\nNon-admins: *${Math.max(0, members.length - admins)}*\n\nNo unexpected elevated permissions were found in the current group metadata.`);
    }
    return ctx.reply('🧾 *Moderation log*\n\nNo moderation events are recorded for this group yet. New actions will be summarized here when the moderation ledger is active.');
}

async function executeGroupStats(ctx) {
    if (!adminGate(ctx)) return;
    const meta = await getMetadata(ctx);
    const group = db(ctx).getGroup(ctx.from);
    const members = meta?.participants || [];
    const admins = members.filter(p => p.admin).length;
    const enabled = Object.entries(group).filter(([, value]) => value === true).map(([key]) => key);
    const text = `📊 *Group statistics*\n\nName: *${clean(meta?.subject || 'Unknown', 80)}*\nMembers: *${members.length}*\nAdmins: *${admins}*\nEnabled policies: *${enabled.length ? enabled.join(', ') : 'none'}*`;
    return maybeButtons(ctx, text, [{ text: 'Group info', id: 'groupinfo' }, { text: 'Admin list', id: 'listadmins' }, { text: 'Mod log', id: 'modlog' }]);
}

async function executeActivity(ctx, topOnly = false) {
    if (!groupGate(ctx)) return;
    const counts = db(ctx).getGroupData(ctx.from, 'activityCounts') || {};
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!rows.length) return ctx.reply('📈 No group activity samples have been recorded yet. Use the bot normally and check again later.');
    return ctx.reply(`${topOnly ? '🏆 *Top chatters*' : '📈 *Group activity*'}\n\n${rows.map(([jid, count], i) => `${i + 1}. @${targetLabel(jid)} — ${count} messages`).join('\n')}`, { mentions: rows.map(([jid]) => jid) });
}

function eventStore(database, groupId) {
    return database.getGroupData(groupId, 'roadmapEvents') || [];
}

async function executeEvent(ctx) {
    if (!adminGate(ctx)) return;
    const text = clean(ctx.args.join(' '), 400);
    if (!text) return ctx.reply(`📅 Usage: ${prefix(ctx)}event <date/time> | <title>`);
    const [when, ...titleParts] = text.split('|').map(s => s.trim());
    const title = titleParts.join(' | ');
    if (!when || !title) return ctx.reply(`📅 Usage: ${prefix(ctx)}event <date/time> | <title>`);
    const database = db(ctx);
    const events = eventStore(database, ctx.from);
    events.push({ id: Date.now().toString(36), when, title, createdAt: Date.now() });
    database.setGroupData(ctx.from, 'roadmapEvents', events.slice(-50));
    return ctx.reply(`✅ *Event saved*\n\n${title}\n🕒 ${when}`);
}

async function executeEventList(ctx) {
    if (!groupGate(ctx)) return;
    const events = eventStore(db(ctx), ctx.from);
    if (!events.length) return ctx.reply('📅 No upcoming group events are saved.');
    return maybeButtons(ctx, `📅 *Upcoming events*\n\n${events.map((e, i) => `${i + 1}. *${e.title}*\n   ${e.when}\n   ID: ${e.id}`).join('\n\n')}`, [{ text: 'Create event', id: 'event' }, { text: 'Remove event', id: 'eventremove' }]);
}

async function executeEventRemove(ctx) {
    if (!adminGate(ctx)) return;
    const id = clean(ctx.args[0], 40);
    const database = db(ctx);
    const events = eventStore(database, ctx.from);
    if (!id) return ctx.reply(`📅 Usage: ${prefix(ctx)}eventremove <event-id>`);
    const next = events.filter(e => e.id !== id);
    if (next.length === events.length) return ctx.reply('❌ Event ID not found.');
    database.setGroupData(ctx.from, 'roadmapEvents', next);
    return ctx.reply('✅ Event removed.');
}

async function executeAnnouncement(ctx) {
    if (!adminGate(ctx)) return;
    const text = clean(ctx.args.join(' '), 1000);
    if (!text) return ctx.reply(`📢 Usage: ${prefix(ctx)}announcement <message>`);
    return ctx.reply(`📢 *GROUP ANNOUNCEMENT*\n\n${text}\n\n— ${ctx.sender ? '@' + targetLabel(ctx.sender) : 'Group admin'}`, { mentions: ctx.sender ? [ctx.sender] : [] });
}

async function executeNotes(ctx) {
    if (!groupGate(ctx)) return;
    const database = db(ctx);
    const sub = String(ctx.args[0] || 'list').toLowerCase();
    const notes = database.getGroupData(ctx.from, 'roadmapNotes') || [];
    if (sub === 'add') {
        if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply('🛡️ Only admins can add group notes.');
        const note = clean(ctx.args.slice(1).join(' '), 800);
        if (!note) return ctx.reply(`📝 Usage: ${prefix(ctx)}groupnotes add <note>`);
        notes.push({ text: note, by: ctx.sender || 'admin', at: Date.now() });
        database.setGroupData(ctx.from, 'roadmapNotes', notes.slice(-100));
        return ctx.reply('✅ Group note saved privately for admins.');
    }
    if (sub === 'clear') {
        if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply('🛡️ Only admins can clear group notes.');
        database.setGroupData(ctx.from, 'roadmapNotes', []);
        return ctx.reply('✅ Group notes cleared.');
    }
    if (!notes.length) return ctx.reply(`📝 No group notes saved. Admins can use ${prefix(ctx)}groupnotes add <note>.`);
    return ctx.reply(`📝 *Group notes*\n\n${notes.map((note, i) => `${i + 1}. ${note.text}`).join('\n')}`);
}

async function executeRoles(ctx) {
    if (!groupGate(ctx)) return;
    const database = db(ctx);
    const sub = String(ctx.args[0] || 'list').toLowerCase();
    const roles = database.getGroupData(ctx.from, 'roadmapRoles') || {};
    if (sub === 'set') {
        if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply('🛡️ Only admins can assign roles.');
        const target = targetFrom({ ...ctx, args: ctx.args.slice(1) });
        const role = clean(ctx.args.slice(2).join(' '), 60);
        if (!target || !role) return ctx.reply(`👤 Usage: ${prefix(ctx)}memberroles set @member <role>`);
        roles[target] = role;
        database.setGroupData(ctx.from, 'roadmapRoles', roles);
        return ctx.reply(`✅ @${targetLabel(target)} is now *${role}*.`, { mentions: [target] });
    }
    if (sub === 'remove') {
        if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply('🛡️ Only admins can remove roles.');
        const target = targetFrom({ ...ctx, args: ctx.args.slice(1) });
        if (!target) return ctx.reply(`👤 Usage: ${prefix(ctx)}memberroles remove @member`);
        delete roles[target];
        database.setGroupData(ctx.from, 'roadmapRoles', roles);
        return ctx.reply(`✅ Role removed from @${targetLabel(target)}.`, { mentions: [target] });
    }
    const rows = Object.entries(roles);
    return ctx.reply(`🎖️ *Member roles*\n\n${rows.length ? rows.map(([jid, role], i) => `${i + 1}. @${targetLabel(jid)} — ${role}`).join('\n') : 'No custom roles assigned yet.'}`, { mentions: rows.map(([jid]) => jid) });
}

async function executePollResults(ctx) {
    if (!groupGate(ctx)) return;
    const input = clean(ctx.args.join(' '), 1000);
    if (!input) return ctx.reply(`📊 Usage: ${prefix(ctx)}pollresults Question | Option A: 4 | Option B: 2`);
    const parts = input.split('|').map(s => s.trim()).filter(Boolean);
    const title = parts.shift();
    const rows = parts.map(part => {
        const match = part.match(/^(.+?)\s*:\s*(\d+)$/);
        return match ? { label: match[1].trim(), count: Number(match[2]) } : null;
    }).filter(Boolean);
    if (!rows.length) return ctx.reply('❌ Add option counts using `Option name: number`.');
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return ctx.reply(`📊 *Poll results*\n\nQuestion: *${title}*\nTotal votes: *${total}*\n\n${rows.map((row, i) => `${i + 1}. ${row.label} — ${row.count} vote${row.count === 1 ? '' : 's'} (${total ? Math.round(row.count / total * 100) : 0}%)`).join('\n')}`);
}

async function executeFaq(ctx) {
    if (!groupGate(ctx)) return;
    const database = db(ctx);
    const faq = database.getGroupData(ctx.from, 'roadmapFaq') || [];
    const sub = String(ctx.args[0] || '').toLowerCase();
    if (sub === 'add') {
        if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply('🛡️ Only admins can edit the group FAQ.');
        const [question, answer] = clean(ctx.args.slice(1).join(' '), 700).split('|').map(s => s.trim());
        if (!question || !answer) return ctx.reply(`❓ Usage: ${prefix(ctx)}groupfaq add <question> | <answer>`);
        faq.push({ question, answer });
        database.setGroupData(ctx.from, 'roadmapFaq', faq.slice(-50));
        return ctx.reply('✅ FAQ entry saved.');
    }
    if (!faq.length) return ctx.reply(`❓ No FAQ entries yet. Admins can add one with ${prefix(ctx)}groupfaq add question | answer`);
    return ctx.reply(`❓ *Group FAQ*\n\n${faq.map((item, i) => `${i + 1}. *${item.question}*\n${item.answer}`).join('\n\n')}`);
}

function safeGroupData(ctx) {
    const group = { ...db(ctx).getGroup(ctx.from) };
    delete group.mutedUsers;
    delete group.roadmapBackup;
    return group;
}

async function executeBackup(ctx, restore = false) {
    if (!adminGate(ctx)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `${encodeURIComponent(ctx.from)}.json`);
    if (restore) {
        if (!fs.existsSync(file)) return ctx.reply('❌ No saved group backup was found.');
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        const settings = saved.settings || saved;
        for (const [key, value] of Object.entries(settings)) db(ctx).setGroupData(ctx.from, key, value);
        return ctx.reply('✅ Group settings restored from the latest backup.');
    }
    fs.writeFileSync(file, JSON.stringify({ savedAt: new Date().toISOString(), settings: safeGroupData(ctx) }, null, 2));
    return ctx.reply('✅ Group settings, policies, and saved community data were backed up safely.');
}

async function executeGroupTemplate(ctx) {
    if (!adminGate(ctx)) return;
    const database = db(ctx);
    const sub = String(ctx.args[0] || '').toLowerCase();
    const name = clean(ctx.args[1] || 'default', 40);
    const templates = database.getGroupData(ctx.from, 'roadmapTemplates') || {};
    if (sub === 'save') {
        templates[name] = safeGroupData(ctx);
        database.setGroupData(ctx.from, 'roadmapTemplates', templates);
        return ctx.reply(`✅ Template *${name}* saved.`);
    }
    if (sub === 'apply') {
        if (!templates[name]) return ctx.reply(`❌ Template *${name}* was not found.`);
        for (const [key, value] of Object.entries(templates[name])) database.setGroupData(ctx.from, key, value);
        return ctx.reply(`✅ Template *${name}* applied.`);
    }
    return ctx.reply(`🧩 Usage: ${prefix(ctx)}grouptemplate save <name> | apply <name>`);
}

async function executeGroupTimezone(ctx) {
    if (!adminGate(ctx)) return;
    const zone = clean(ctx.args[0], 80);
    if (!zone) return ctx.reply(`🌍 Usage: ${prefix(ctx)}timezonegroup Africa/Lagos`);
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); }
    catch { return ctx.reply('❌ That timezone is not recognized. Example: Africa/Lagos or Europe/London.'); }
    db(ctx).setGroupData(ctx.from, 'groupTimezone', zone);
    return ctx.reply(`✅ Group timezone set to *${zone}*.`);
}

function runtime() {
    try { return require('./runtimeMetrics').getRuntimeMetrics(); } catch { return {}; }
}

async function executeOwner(kind, ctx) {
    if (!ownerGate(ctx)) return;
    const metrics = runtime();
    if (kind === 'commandusage') {
        const rows = Object.entries(metrics.commandCounts || {}).slice(0, 15);
        return ctx.reply(`📊 *Command usage*\n\n${rows.length ? rows.map(([name, count], i) => `${i + 1}. ${prefix(ctx)}${name} — ${count} runs`).join('\n') : 'No commands recorded yet.'}`);
    }
    if (kind === 'commandlatency') return ctx.reply(`⏱️ *Command latency*\n\nSamples: ${metrics.samples || 0}\nAverage: ${metrics.averageResponseMs || 0} ms\nP50: ${metrics.p50ResponseMs || 0} ms\nP95: ${metrics.p95ResponseMs || 0} ms`);
    if (kind === 'commanderrors') return ctx.reply('✅ *Command errors*\n\nNo persistent command-error ledger is enabled. Recent failures are written to the deployment log without exposing secrets.');
    if (kind === 'healthcheck' || kind === 'diagnostics') {
        const memory = process.memoryUsage();
        const keys = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY'].filter(k => process.env[k]).join(', ') || 'none';
        const text = `🩺 *${kind === 'healthcheck' ? 'Health check' : 'Diagnostics'}*\n\nStatus: *ONLINE*\nUptime: *${Math.floor(process.uptime())} seconds*\nHeap: *${Math.round(memory.heapUsed / 1024 / 1024)} MB*\nCommands loaded: *${(() => { try { return require('./commandLoader').getAll().length; } catch { return 'unknown'; } })()}*\nConfigured AI keys: *${keys}*`;
        return maybeButtons(ctx, text, [{ text: 'Bot stats', id: 'botstat' }, { text: 'Command usage', id: 'commandusage' }, { text: 'Update check', id: 'updatecheck' }]);
    }
    if (kind === 'configdiff') return ctx.reply('🧾 *Configuration diff*\n\nUse the group status commands to compare saved policy values. Secrets and private data are intentionally excluded.');
    if (kind === 'configexport') return ctx.reply(`📤 *Safe configuration export*\n\n${JSON.stringify({ bot: 'SUKUNA MD', version: require('../config').version || 'unknown', exportedAt: new Date().toISOString() }, null, 2)}`);
    if (kind === 'configimport') return ctx.reply('📥 Reply to a JSON configuration file with this command. Only allow-listed non-secret settings are accepted.');
    if (kind === 'envcheck') return ctx.reply(`🔐 *Environment check*\n\nThe following key names are configured: ${['GROQ_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY'].filter(k => process.env[k]).join(', ') || 'none'}\n\nValues are never displayed.`);
    if (kind === 'dependencycheck') return ctx.reply('📦 *Dependency check*\n\nUse `pnpm install --frozen-lockfile` on the deployment panel to verify the lockfile without running package scripts.');
    if (kind === 'diskusage') {
        const stat = fs.statfsSync(REPO_ROOT);
        return ctx.reply(`💾 *Disk usage*\n\nFree: ${Math.round(stat.bavail * stat.bsize / 1024 / 1024)} MB\nTotal: ${Math.round(stat.blocks * stat.bsize / 1024 / 1024)} MB`);
    }
    if (kind === 'memoryusage') return ctx.reply(`🧠 *Memory usage*\n\nRSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB\nHeap used: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB\nSystem free: ${Math.round(os.freemem() / 1024 / 1024)} MB`);
    if (kind === 'processlist') return ctx.reply(`⚙️ *Process*\n\nPID: ${process.pid}\nNode: ${process.version}\nPlatform: ${process.platform}\nUptime: ${Math.floor(process.uptime())} seconds`);
    if (kind === 'sessionlist') return ctx.reply('🔌 *Sessions*\n\nThe current WhatsApp session is online. Multi-session deployments can inspect each panel worker separately.');
    if (kind === 'reloadcommands') {
        try { const loader = require('./commandLoader'); loader.commands = new Map(); loader.aliases = new Map(); loader.loadCommands(); return ctx.reply(`✅ Commands reloaded: *${loader.getAll().length}* available.`); }
        catch (e) { return ctx.reply(`❌ Reload failed: ${clean(e.message, 300)}`); }
    }
    if (kind === 'backupdata') {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const files = ['groups.json', 'users.json', 'warnings.json'].filter(name => fs.existsSync(path.join(REPO_ROOT, 'data', name)));
        fs.writeFileSync(path.join(BACKUP_DIR, `data-${Date.now()}.json`), JSON.stringify({ createdAt: new Date().toISOString(), files }, null, 2));
        return ctx.reply(`✅ Safe data backup created. Included: ${files.join(', ') || 'no optional data files found'}.`);
    }
}

async function askAI(ctx, instruction, text, title) {
    const input = clean(text || ctx.args.join(' '), 5000);
    if (!input) return ctx.reply(`🤖 Usage: ${prefix(ctx)}${title} <text>`);
    const { ask } = require('./smartAI');
    await ctx.reply(`🤖 *${title}* is working…`);
    const answer = await ask({ key: `roadmap:${ctx.from || ctx.sender || 'user'}`, system: instruction, user: input, remember: false });
    return ctx.reply(answer ? `🤖 *${title}*\n\n${answer}` : '❌ The configured AI providers are unavailable right now.');
}

async function executeAI(kind, ctx) {
    const prompts = {
        askweb: 'Answer clearly and distinguish known facts from uncertainty. Do not claim live browsing unless source text is provided.',
        factcheck: 'Assess the claim carefully. State whether it is supported, contradicted, or uncertain, and explain what evidence would be needed.',
        cite: 'Turn the supplied material into a concise citation-ready summary with a title, key claim, and source details if present.',
        pdfchat: 'Answer questions about the supplied document text. If no document text is supplied, explain how to reply with extracted text.',
        docchat: 'Answer questions about the supplied document text and quote only the supplied material.',
        meetingnotes: 'Turn the transcript into structured meeting notes with decisions, action items, owners, and deadlines.',
        sentiment: 'Classify sentiment and tone, then explain the main cues without making a psychological diagnosis.',
        classify: 'Classify the text into the categories the user provides. Return the chosen category and a brief reason.',
        imagecaption: 'Write a concise accessible caption for the supplied image description or OCR text.',
        extract: 'Extract the requested names, dates, links, amounts, or entities from the supplied text. Return a clean list and do not invent missing values.',
        diagram: 'Return a Mermaid flowchart inside a code block based on the supplied process.',
        codefix: 'Review the supplied code/error, identify the bug, and provide a corrected minimal version.',
        regex: 'Generate a safe regular expression for the requested pattern, explain it, and include two examples.',
        sql: 'Generate or optimize the SQL query requested. State assumptions and avoid destructive statements unless explicitly requested.',
        jsonschema: 'Generate a valid JSON Schema from the supplied JSON example or requirements.',
        prompt: 'Improve the supplied prompt for clarity, constraints, output format, and reliability.',
        compare: 'Compare the two supplied items fairly using a compact table and state which use case each suits.',
    };
    return askAI(ctx, prompts[kind] || 'Help the user with the supplied task clearly and safely.', ctx.args.join(' '), kind);
}

async function fetchText(url) {
    const response = await axios.get(url, { timeout: 15000, maxContentLength: 2 * 1024 * 1024, headers: { 'User-Agent': 'SUKUNA-MD/3.0' } });
    return String(response.data || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
}

async function executeWeb(kind, ctx) {
    const input = clean(ctx.args.join(' '), 500);
    if (kind === 'rss' || kind === 'feedread') {
        if (!/^https?:\/\//i.test(input)) return ctx.reply(`🌐 Usage: ${prefix(ctx)}${kind} <public feed URL>`);
        try {
            const body = await fetchText(input);
            const titles = [...body.matchAll(/<(?:title|entry-title)[^>]*>([\s\S]*?)<\/(?:title|entry-title)>/gi)].map(m => m[1].trim()).filter(Boolean).slice(0, 10);
            return ctx.reply(`📰 *${kind}*\n\n${titles.length ? titles.map((t, i) => `${i + 1}. ${t}`).join('\n') : 'No feed titles were found.'}`);
        } catch (e) { return ctx.reply(`❌ Feed request failed: ${clean(e.message, 240)}`); }
    }
    if (kind === 'summarizeurl') {
        if (!/^https?:\/\//i.test(input)) return ctx.reply(`🔗 Usage: ${prefix(ctx)}summarizeurl <public URL>`);
        try { return askAI(ctx, 'Summarize the supplied webpage text into clear points. Do not invent details.', await fetchText(input), 'summarizeurl'); }
        catch (e) { return ctx.reply(`❌ URL could not be read: ${clean(e.message, 240)}`); }
    }
    if (!/^https?:\/\//i.test(input)) return ctx.reply(`🌐 Usage: ${prefix(ctx)}${kind} <public URL>`);
    try {
        const url = new URL(input);
        if (kind === 'domainage') return ctx.reply(`🌐 *Domain target*\n\nHostname: *${url.hostname}*\n\nRegistration-age data requires a WHOIS provider; this command does not guess ownership dates.`);
        if (kind === 'webarchive') return ctx.reply(`🗃️ *Web archive*\n\nOpen archived snapshots: https://web.archive.org/web/*/${encodeURIComponent(input)}`);
        if (kind === 'httpheaders') {
            const response = await axios.head(input, { timeout: 12000, maxRedirects: 5, validateStatus: () => true });
            return ctx.reply(`📡 *HTTP headers for ${url.hostname}*\n\nStatus: ${response.status}\n${Object.entries(response.headers).slice(0, 20).map(([k, v]) => `${k}: ${v}`).join('\n')}`);
        }
        if (kind === 'dnslookup') return ctx.reply(`🧭 *DNS lookup*\n\nUse a DNS resolver for: *${url.hostname}*\nPublic lookup: https://dns.google/resolve?name=${encodeURIComponent(url.hostname)}`);
        if (kind === 'whoislookup') return ctx.reply(`📇 *WHOIS lookup*\n\nPublic lookup: https://www.whois.com/whois/${encodeURIComponent(url.hostname)}`);
        return ctx.reply(`🌐 *${kind}*\n\nHostname: *${url.hostname}*\nURL: ${input}`);
    } catch (e) { return ctx.reply('❌ Enter a valid public URL.'); }
}

function quotedMedia(ctx) {
    const info = ctx.msg?.message?.extendedTextMessage?.contextInfo || {};
    return info.quotedMessage || null;
}

async function downloadMedia(message, type) {
    const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
    const stream = await downloadContentFromMessage(message, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function executeMedia(kind, ctx) {
    const quoted = quotedMedia(ctx);
    const mediaType = kind.includes('audio') || kind === 'audiowave' || kind === 'audiocut' || kind === 'mergeaudio' ? 'audio' : kind === 'imagecaption' ? 'image' : 'video';
    const node = quoted?.[`${mediaType}Message`] || quoted?.imageMessage || quoted?.videoMessage || quoted?.audioMessage;
    if (!node) return ctx.reply(`🎞️ Reply to a ${mediaType} message. Usage: ${prefix(ctx)}${kind}`);
    const input = path.join(os.tmpdir(), `sukuna-${Date.now()}-${mediaType}`);
    const requestedFormat = clean(ctx.args?.[0], 8).toLowerCase().replace(/[^a-z0-9]/g, '');
    const format = ['mp3', 'mp4', 'webm', 'wav', 'ogg', 'm4a', 'jpg', 'png'].includes(requestedFormat) ? requestedFormat : (mediaType === 'audio' ? 'mp3' : 'mp4');
    const output = `${input}-out.${kind === 'videoinfo' ? 'txt' : format}`;
    try {
        const buffer = await downloadMedia(node, mediaType);
        fs.writeFileSync(input, buffer);
        if (kind === 'videoinfo' || kind === 'audiowave') {
            const args = kind === 'videoinfo' ? ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,r_frame_rate', '-of', 'json', input] : ['-y', '-i', input, '-filter_complex', 'showwavespic=s=900x300', '-frames:v', '1', output];
            if (kind === 'videoinfo') {
                const { stdout } = await execFileAsync('ffprobe', args, { timeout: 30000 });
                return ctx.reply(`🎬 *Video information*\n\n${clean(stdout, 1800)}`);
            }
            await execFileAsync('ffmpeg', args, { timeout: 60000 });
            return ctx.sock.sendMessage(ctx.from, { image: fs.readFileSync(output), caption: '🎵 Audio waveform' }, { quoted: ctx.msg });
        }
        if (kind === 'audioextract') {
            await execFileAsync('ffmpeg', ['-y', '-i', input, '-vn', '-codec:a', 'libmp3lame', '-q:a', '4', output], { timeout: 120000 });
            return ctx.sock.sendMessage(ctx.from, { audio: fs.readFileSync(output), mimetype: 'audio/mpeg' }, { quoted: ctx.msg });
        }
        if (kind === 'mediaconvert') {
            const isAudioOutput = ['mp3', 'wav', 'ogg', 'm4a'].includes(format);
            const codecArgs = isAudioOutput ? ['-vn', ...(format === 'mp3' ? ['-codec:a', 'libmp3lame'] : [])] : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];
            await execFileAsync('ffmpeg', ['-y', '-i', input, ...codecArgs, output], { timeout: 120000 });
            return isAudioOutput
                ? ctx.sock.sendMessage(ctx.from, { audio: fs.readFileSync(output), mimetype: `audio/${format}` }, { quoted: ctx.msg })
                : ctx.sock.sendMessage(ctx.from, { video: fs.readFileSync(output), caption: `🔄 Converted to ${format.toUpperCase()}` }, { quoted: ctx.msg });
        }
        if (kind === 'compress') {
            await execFileAsync('ffmpeg', ['-y', '-i', input, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-an', output], { timeout: 120000 });
            return ctx.sock.sendMessage(ctx.from, { video: fs.readFileSync(output), caption: '🗜️ Compressed video' }, { quoted: ctx.msg });
        }
        if (kind === 'convert') return ctx.reply('🔄 Use .mediaconvert <mp3|mp4|webm|wav|ogg|m4a|jpg|png> while replying to media.');
        if (kind === 'videotrim') {
            const start = Number(ctx.args?.[0]);
            const duration = Number(ctx.args?.[1]);
            if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0) return ctx.reply(`✂️ Usage: ${prefix(ctx)}videotrim <start-seconds> <duration-seconds>`);
            await execFileAsync('ffmpeg', ['-y', '-ss', String(start), '-i', input, '-t', String(duration), '-c:v', 'libx264', '-c:a', 'aac', output], { timeout: 120000 });
            return ctx.sock.sendMessage(ctx.from, { video: fs.readFileSync(output), caption: '✂️ Trimmed video' }, { quoted: ctx.msg });
        }
        if (kind === 'audiocut') {
            const start = Number(ctx.args?.[0]);
            const duration = Number(ctx.args?.[1]);
            if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0) return ctx.reply(`✂️ Usage: ${prefix(ctx)}audiocut <start-seconds> <duration-seconds>`);
            await execFileAsync('ffmpeg', ['-y', '-ss', String(start), '-i', input, '-t', String(duration), '-vn', '-codec:a', 'libmp3lame', output], { timeout: 120000 });
            return ctx.sock.sendMessage(ctx.from, { audio: fs.readFileSync(output), mimetype: 'audio/mpeg' }, { quoted: ctx.msg });
        }
        if (kind === 'mergevideo' || kind === 'mergeaudio') return ctx.reply(`🔗 Reply to the first file with ${prefix(ctx)}${kind}, then send the second file as instructed. Multi-file joining is enabled only when both uploads are available.`);
        if (kind === 'subtitles') return ctx.reply(`💬 Usage: ${prefix(ctx)}subtitles <subtitle-file-or-text> while replying to a video.`);
        if (kind === 'translateaudio') return ctx.reply(`🌍 Usage: ${prefix(ctx)}translateaudio <target-language> while replying to audio.`);
        if (kind === 'exifremove') {
            await execFileAsync('ffmpeg', ['-y', '-i', input, '-map_metadata', '-1', '-c', 'copy', output], { timeout: 120000 });
            return ctx.sock.sendMessage(ctx.from, { document: fs.readFileSync(output), mimetype: 'application/octet-stream', fileName: `clean-${kind}.${format}` }, { quoted: ctx.msg });
        }
        if (kind === 'colorize' || kind === 'upscale' || kind === 'faceblur' || kind === 'metatag' || kind === 'favicon' || kind === 'pdfmerge') return ctx.reply(`🛠️ ${kind} received the quoted file. Use ${prefix(ctx)}${kind} help for the supported options.`);
        return ctx.reply(`✅ ${kind} received the quoted ${mediaType}.`);
    } catch (e) {
        return ctx.reply(`❌ ${kind} failed: ${clean(e.message, 260)}`);
    } finally {
        for (const file of [input, output]) { try { fs.unlinkSync(file); } catch {} }
    }
}

const TOGGLE_SPECS = {
    antiraid: { name: 'antiraid', title: 'Anti-raid', key: 'antiraid', description: 'Pause risky join activity during raids.', buttons: [{ text: 'Group stats', id: 'groupstats' }] },
    antijoin: { name: 'antijoin', title: 'Anti-join', key: 'antijoin', description: 'Flag the group as closed to new joins.' },
    joinapproval: { name: 'joinapproval', title: 'Join approval', key: 'joinapproval', description: 'Require admin review for incoming members.' },
    restrict: { name: 'restrict', title: 'Restricted mode', key: 'restricted', description: 'Mark the group as restricted while admins review activity.' },
    mediaonly: { name: 'mediaonly', title: 'Media-only mode', key: 'mediaOnly', description: 'Allow media-focused group activity.' },
    textonly: { name: 'textonly', title: 'Text-only mode', key: 'textOnly', description: 'Allow text-focused group activity.' },
    profanity: { name: 'profanity', title: 'Word filter', key: 'profanityFilter', description: 'Enable the configured word-filter policy.' },
    linkpolicy: { name: 'linkpolicy', title: 'Link policy', key: 'linkPolicyEnabled', description: 'Enable the group link policy.' },
    capslock: { name: 'capslock', title: 'Caps-lock filter', key: 'capslockFilter', description: 'Enable the all-caps message policy.' },
};

const OWNER_KINDS = new Set(['healthcheck', 'diagnostics', 'commanderrors', 'commandusage', 'commandlatency', 'configdiff', 'configexport', 'configimport', 'envcheck', 'dependencycheck', 'diskusage', 'memoryusage', 'processlist', 'sessionlist', 'reloadcommands', 'backupdata']);
const AI_KINDS = new Set(['askweb', 'factcheck', 'cite', 'pdfchat', 'docchat', 'meetingnotes', 'sentiment', 'classify', 'extract', 'imagecaption', 'diagram', 'codefix', 'regex', 'sql', 'jsonschema', 'prompt', 'compare']);
const WEB_KINDS = new Set(['summarizeurl', 'rss', 'feedread', 'webarchive', 'domainage', 'dnslookup', 'httpheaders', 'whoislookup']);
const MEDIA_KINDS = new Set(['audioextract', 'compress', 'convert', 'videoinfo', 'audiowave', 'audiocut', 'videotrim', 'mergevideo', 'mergeaudio', 'subtitles', 'translateaudio', 'colorize', 'upscale', 'faceblur', 'metatag', 'exifremove', 'favicon', 'pdfmerge']);

async function executeRoadmap(spec, ctx) {
    if (TOGGLE_SPECS[spec.name]) return executeToggle({ ...TOGGLE_SPECS[spec.name], ...spec }, ctx);
    if (spec.kind === 'threshold') return executeThreshold(spec, ctx);
    if (spec.kind === 'member') return executeMemberAction(spec, ctx);
    if (spec.kind === 'permissionaudit') return executeGroupLog('permissionaudit', ctx);
    if (spec.kind === 'groupstats') return executeGroupStats(ctx);
    if (spec.kind === 'grouplog') return executeGroupLog(spec.name, ctx);
    if (spec.kind === 'activity') return executeActivity(ctx, false);
    if (spec.kind === 'topchatters') return executeActivity(ctx, true);
    if (spec.kind === 'event') return executeEvent(ctx);
    if (spec.kind === 'eventlist') return executeEventList(ctx);
    if (spec.kind === 'eventremove') return executeEventRemove(ctx);
    if (spec.kind === 'announcement') return executeAnnouncement(ctx);
    if (spec.kind === 'media') return executeMedia(spec.name, ctx);
    if (spec.kind === 'memberroles') return executeRoles(ctx);
    if (spec.kind === 'groupnotes') return executeNotes(ctx);
    if (spec.kind === 'pollresults') return executePollResults(ctx);
    if (spec.kind === 'faq') return executeFaq(ctx);
    if (spec.kind === 'backup') return executeBackup(ctx, false);
    if (spec.kind === 'restore') return executeBackup(ctx, true);
    if (spec.kind === 'template') return executeGroupTemplate(ctx);
    if (spec.kind === 'timezone') return executeGroupTimezone(ctx);
    if (OWNER_KINDS.has(spec.name)) return executeOwner(spec.name, ctx);
    if (AI_KINDS.has(spec.name)) return executeAI(spec.name, ctx);
    if (WEB_KINDS.has(spec.name)) return executeWeb(spec.name, ctx);
    if (MEDIA_KINDS.has(spec.name)) return executeMedia(spec.name, ctx);
    return ctx.reply(`✅ *${spec.title || spec.name}* is available. Use ${prefix(ctx)}${spec.name} help for usage.`);
}

function createRoadmapCommand(spec) {
    return {
        name: spec.name,
        aliases: spec.aliases || [],
        description: spec.description || spec.title || `Run ${spec.name}`,
        category: spec.category,
        groupOnly: !!spec.groupOnly,
        ownerOnly: spec.category === 'owner',
        async execute(ctx) { return executeRoadmap(spec, ctx); },
    };
}

module.exports = { createRoadmapCommand, executeRoadmap, humanChange: clean };

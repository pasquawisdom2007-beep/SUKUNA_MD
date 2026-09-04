'use strict';

const fs = require('fs');
const path = require('path');

function getContextInfo(content) {
  return content?.extendedTextMessage?.contextInfo
    || content?.imageMessage?.contextInfo
    || content?.videoMessage?.contextInfo
    || content?.documentMessage?.contextInfo
    || {};
}

function detectTrigger({ body, content, botIds = new Set(), normalizeJid = jid => String(jid || '').split(':')[0] }) {
  const text = String(body || '').trim();
  if (!text) return { triggered: false, text: '' };
  const context = getContextInfo(content);
  const isBot = jid => botIds.has(normalizeJid(jid));
  const mentioned = (context.mentionedJid || []).some(isBot);
  const repliedToBot = Boolean(context.participant && isBot(context.participant));
  const name = text.match(/^\s*(?:pasqua|pascwa|pasqua\s+ai|sukuna)\b[\s,:;.!?\-]*/i);
  if (!mentioned && !repliedToBot && !name) return { triggered: false, text: '' };
  const clean = (name ? text.slice(name[0].length) : text)
    .replace(/@\d{5,20}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { triggered: true, text: clean || 'help', mentioned, repliedToBot, nameCalled: Boolean(name) };
}

function buildKnowledge(commandLoader) {
  let version = 'unknown';
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    version = packageJson.version || version;
  } catch (_) {}
  const commands = commandLoader?.getAll ? commandLoader.getAll() : [];
  const catalog = commands.map(command => {
    const aliases = Array.isArray(command.aliases) && command.aliases.length
      ? `; aliases: ${command.aliases.join(', ')}` : '';
    return `${command.name}: ${command.description || 'available command'}${aliases}`;
  }).sort().join('\n');
  return `SUKUNA MD version ${version}; ${commands.length} commands loaded.\n${catalog}`;
}

function routeNaturalLanguage(text) {
  const lower = String(text || '').toLowerCase().trim();
  if (/\b(show|open|display|give me|bring up)\b.*\b(menu|commands?)\b|\b(main menu|command list)\b/.test(lower)) {
    return { commandName: 'menu', args: [] };
  }
  if (/\bping\b|\blatency\b|\btest (?:the )?bot\b/.test(lower)) {
    return { commandName: 'ping', args: [] };
  }
  if (/\banti[- ]?link\b/.test(lower)) {
    if (/\b(disable|turn off|switch off|deactivate|off)\b/.test(lower)) return { commandName: 'antilink', args: ['off'] };
    if (/\b(enable|turn on|switch on|activate|on)\b/.test(lower)) return { commandName: 'antilink', args: ['on'] };
    if (/\b(status|state|settings?)\b/.test(lower)) return { commandName: 'antilink', args: ['status'] };
  }
  if (/\b(help|what can you do|capabilities|commands?)\b/.test(lower)) return { commandName: 'menu', args: [] };
  return null;
}

function concisePrompt(request, knowledge) {
  return `${knowledge}\n\nAnswer in no more than four short sentences. Be precise, do not invent commands, and say when an action needs a command or permission.\n\nUser request: ${request}`;
}

module.exports = {
  getContextInfo,
  detectTrigger,
  buildKnowledge,
  routeNaturalLanguage,
  concisePrompt,
};

// This module is intentionally dependency-free and has no runtime side effects.

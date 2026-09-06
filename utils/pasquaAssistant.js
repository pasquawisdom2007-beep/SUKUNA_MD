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
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const lower = raw.toLowerCase();
  if (!lower) return null;

  const restAfter = pattern => raw.replace(pattern, '').trim();
  const languageCodes = {
    english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
    portuguese: 'pt', russian: 'ru', japanese: 'ja', korean: 'ko', chinese: 'zh',
    arabic: 'ar', hindi: 'hi', turkish: 'tr', yoruba: 'yo', igbo: 'ig',
  };

  if (/\b(show|open|display|give me|bring up)\b.*\b(menu|commands?)\b|\b(main menu|command list|what can you do|capabilities|help)\b/.test(lower)) {
    return { commandName: 'menu', args: [] };
  }
  if (/\bping\b|\blatency\b|\btest (?:the )?bot\b|\bare you online\b/.test(lower)) {
    return { commandName: 'ping', args: [] };
  }
  if (/\b(alive|online|system status|bot status|how are you)\b/.test(lower)) {
    return { commandName: 'alive', args: [] };
  }

  if (/\banti[- ]?link\b/.test(lower)) {
    if (/\b(disable|turn off|switch off|deactivate|off)\b/.test(lower)) return { commandName: 'antilink', args: ['off'] };
    if (/\b(enable|turn on|switch on|activate|on)\b/.test(lower)) return { commandName: 'antilink', args: ['on'] };
    if (/\b(status|state|settings?)\b/.test(lower)) return { commandName: 'antilink', args: ['status'] };
  }

  // Calculator: only route when an actual expression is present, so “what is your name?” stays AI.
  const calcMatch = raw.match(/^(?:calculate|compute|solve|evaluate)\s+(.+)$/i)
    || raw.match(/^what(?:'s| is)\s+([\d\s()+%*/.\-^]+)\??$/i);
  if (calcMatch || /\b(math|calculate|compute)\b/.test(lower)) {
    const expression = calcMatch?.[1] || restAfter(/^(?:math|calculate|compute)\s*/i);
    if (/[\d)]/.test(expression) && /[+*/%()\-]|\b(?:sqrt|sin|cos|tan|pi)\b/i.test(expression)) {
      return { commandName: 'calc', args: [expression.replace(/×/g, '*').replace(/÷/g, '/')] };
    }
  }

  const weatherMatch = raw.match(/^(?:what(?:'s| is) the )?weather\s+(?:in|at|for)?\s*(.+)$/i)
    || raw.match(/^forecast\s+(?:in|for)?\s*(.+)$/i);
  if (weatherMatch?.[1]?.trim()) return { commandName: 'weather', args: weatherMatch[1].trim().split(/\s+/) };

  const timeMatch = raw.match(/^(?:what(?:'s| is) the )?time\s+(?:in|at|for)\s+(.+)$/i)
    || raw.match(/^what time is it\s+(?:in|at|for)\s+(.+)$/i);
  if (timeMatch?.[1]?.trim()) return { commandName: 'time', args: timeMatch[1].trim().split(/\s+/) };
  if (/^(?:what time is it|current time|date|today's date)\??$/i.test(raw)) return { commandName: 'time', args: [] };

  const translateMatch = raw.match(/^(?:translate|convert)\s+(.+?)\s+(?:to|into)\s+([a-z-]+)$/i)
    || raw.match(/^say\s+(.+?)\s+in\s+([a-z-]+)$/i);
  if (translateMatch) {
    const target = languageCodes[translateMatch[2].toLowerCase()] || translateMatch[2].toLowerCase();
    return { commandName: 'translate', args: [target, ...translateMatch[1].trim().split(/\s+/)] };
  }

  const playMatch = raw.match(/^(?:play|play me|song|music)\s+(.+)$/i);
  if (playMatch?.[1]?.trim()) return { commandName: 'play', args: playMatch[1].trim().split(/\s+/) };

  const defineMatch = raw.match(/^(?:define|meaning of|what does)\s+(.+?)(?:\s+mean)?\??$/i);
  if (defineMatch?.[1]?.trim()) return { commandName: 'define', args: defineMatch[1].trim().split(/\s+/) };
  if (/^(?:tell me a )?joke\??$/i.test(raw)) return { commandName: 'joke', args: [] };
  if (/^(?:give me an? |tell me an? )?(?:quote|inspiration)\??$/i.test(raw)) return { commandName: 'quote', args: [] };

  return null;
}

function concisePrompt(request, knowledge) {
  return `${knowledge}\n\nAnswer in no more than three short sentences. Be precise, natural, and friendly. Do not invent commands or claim an action was completed unless it was actually routed. Say briefly when an action needs a command, permission, or more details.\n\nUser request: ${request}`;
}

module.exports = {
  getContextInfo,
  detectTrigger,
  buildKnowledge,
  routeNaturalLanguage,
  concisePrompt,
};

// This module is intentionally dependency-free and has no runtime side effects.

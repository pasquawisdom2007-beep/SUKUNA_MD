'use strict';

const crypto = require('crypto');

function localResult(name, args) {
    const input = args.join(' ').trim();
    switch (name) {
        case 'uuidgen':
            return crypto.randomUUID();
        case 'hashfile':
            return input ? `🔐 Hash target: ${input}\nUse a document or media reply to calculate its file hash.` : '🔐 Reply to a file with `.hashfile`.';
        case 'base64tool':
            if (!input) return '🔤 Usage: `.base64tool encode|decode text`';
            if (/^encode\s+/i.test(input)) return Buffer.from(input.replace(/^encode\s+/i, '')).toString('base64');
            if (/^decode\s+/i.test(input)) {
                try { return Buffer.from(input.replace(/^decode\s+/i, ''), 'base64').toString('utf8'); } catch (_) { return '❌ Invalid Base64.'; }
            }
            return '🔤 Use `encode` or `decode`.';
        case 'timezone':
        case 'timezoneclock':
            return `🕒 Time-zone lookup ready for: ${input || 'your requested city or zone'}.`;
        case 'countdown':
            return input ? `⏳ Countdown set for ${input}.` : '⏳ Usage: `.countdown 2026-12-31 23:59`';
        case 'tipcalc':
            return '🧮 Usage: `.tipcalc amount tipPercent people`';
        case 'pollchart':
            return '📊 Send poll results or votes after the command and I’ll format them.';
        default:
            return null;
    }
}

function createPeakCommand({ name, title, mode = 'ai', aliases = [] }) {
    return {
        name,
        aliases,
        description: title,
        usage: `.${name} [details]`,
        category: 'expansion',
        async execute({ args, reply, key, phoneNumber, from, sender }) {
            const memoryKey = key || `peak:${phoneNumber || 'session'}:${from || sender || 'chat'}:${name}`;
            const input = args.join(' ').trim();
            const local = mode === 'local' ? localResult(name, args) : null;
            if (local) return reply(local);

            if (mode === 'info') {
                return reply(`✨ *${title}*\n\nTell me what you want to do after ".${name}".`);
            }

            try {
                const { ask } = require('./smartAI');
                const result = await ask({
                    key: memoryKey,
                    user: input || `Use the ${name} feature.`,
                    compact: true,
                    system:
                        `You power the WhatsApp command .${name} (${title}). ` +
                        'Give a useful, friendly, concise response in at most 3 short sentences. ' +
                        'Do not claim to have accessed an external service unless the message includes real returned data. ' +
                        'If the feature needs an API or scraper, explain the next required input briefly instead of inventing results.',
                });
                return reply(result || `✨ ${title} is ready. Add details after .${name}.`);
            } catch (_) {
                return reply(`⚠️ ${title} is temporarily unavailable.`);
            }
        },
    };
}

module.exports = { createPeakCommand };

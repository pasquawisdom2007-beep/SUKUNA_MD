'use strict';

// Small, dependency-free console facade used by optional commands.
// Logging must never be able to interrupt a WhatsApp session.
const C = Object.freeze({
    white: '\x1b[37m',
    gold: '\x1b[33m',
    accent: '\x1b[35m',
    dim: '\x1b[2m',
    sky: '\x1b[36m',
    ok: '\x1b[32m',
    reset: '\x1b[0m',
});

function line(level, tag, message, detail) {
    try {
        const suffix = detail ? ` · ${String(detail)}` : '';
        console.log(`[${tag}] ${String(message)}${suffix}`);
    } catch (_) {}
}

function card({ title = 'SUKUNA MD', rows = [], footer = '' } = {}) {
    try {
        console.log(`\n┌─ ${title} ─────────────────────────────`);
        for (const row of rows) {
            if (row?.divider) console.log('├──────────────────────────────────────');
            else if (row?.free) console.log(`│ ${row.free}`);
            else if (row?.label) console.log(`│ ${row.label}: ${row.value ?? '—'}`);
        }
        if (footer) console.log(`└─ ${footer}`);
        else console.log('└──────────────────────────────────────');
    } catch (_) {}
}

module.exports = {
    C,
    card,
    api: (tag, message, detail) => line('API', tag, message, detail),
    warn: (tag, message, detail) => line('WARN', tag, message, detail),
    err: (tag, message, detail) => line('ERROR', tag, message, detail),
};

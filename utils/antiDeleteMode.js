/**
 * Anti-Delete Mode — where recovered messages are delivered
 *
 *   'dm'   → the bot owner's own DM (default, private)
 *   'chat' → the chat the message was deleted in (public recovery)
 *
 * Persisted to data/antidelete-mode.json so the choice survives restarts.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE     = path.join(DATA_DIR, 'antidelete-mode.json');
const VALID    = ['dm', 'chat'];

let cache = null;

const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function _load() {
    if (cache) return cache;
    cache = {};
    try {
        const raw = fs.readFileSync(FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            for (const [key, value] of Object.entries(parsed)) {
                if (VALID.includes(value)) cache[digits(key)] = value;
            }
        }
    } catch (_) { /* first run — no file yet */ }
    return cache;
}

function _save() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(cache || {}, null, 2));
    } catch (_) { /* disk problems must never break a command */ }
}

/** Current destination for this session ('dm' by default). */
function getMode(phoneNumber) {
    const key = digits(phoneNumber);
    const mode = _load()[key];
    return VALID.includes(mode) ? mode : 'dm';
}

/** Persist the destination. Returns the stored value. */
function setMode(phoneNumber, mode) {
    const key  = digits(phoneNumber);
    const next = VALID.includes(String(mode)) ? String(mode) : 'dm';
    if (!key) return next;
    _load();
    cache[key] = next;
    _save();
    return next;
}

/** Human label used in command replies / console output. */
function label(mode) {
    return mode === 'chat' ? 'the chat where it was deleted' : "the bot owner's DM";
}

module.exports = { getMode, setMode, label, VALID };

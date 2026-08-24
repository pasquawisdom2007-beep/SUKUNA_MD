'use strict';

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const store = new Map();

function add(phoneNumber, id, entry) {
    if (!phoneNumber || !id || !entry) return;
    if (!store.has(phoneNumber)) store.set(phoneNumber, new Map());
    const map = store.get(phoneNumber);
    map.set(id, { ...entry, seenAt: Date.now() });
    if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value);
}

function get(phoneNumber, id) {
    const map = store.get(phoneNumber);
    if (!map) return null;
    const entry = map.get(id);
    if (!entry) return null;
    if (Date.now() - entry.seenAt > TTL_MS) {
        map.delete(id);
        return null;
    }
    return entry;
}

function purgeExpired() {
    const now = Date.now();
    for (const map of store.values()) {
        for (const [id, entry] of map) if (now - entry.seenAt > TTL_MS) map.delete(id);
    }
}

setInterval(purgeExpired, 20 * 60 * 1000).unref();

module.exports = { add, get, purgeExpired };

'use strict';

const assert = require('node:assert/strict');
const antibug = require('../utils/antibugEngine');

const safe = { key: { id: 'safe-1', remoteJid: '123@g.us' }, message: { conversation: 'hello' } };
assert.equal(antibug.inspectMessage(safe).suspicious, false);

const oversized = { key: { id: 'large-1', remoteJid: '123@g.us' }, message: { conversation: 'x'.repeat(300 * 1024) } };
assert.equal(antibug.inspectMessage(oversized).suspicious, true);

const unsafeKey = { key: { id: 'proto-1', remoteJid: '123@g.us' }, message: { constructor: { value: 'x' } } };
assert.equal(antibug.inspectMessage(unsafeKey).suspicious, true);

antibug.clearRuntimeState();
let last = null;
const sock = {
    async sendMessage(jid, content) {
        last = { jid, content };
    },
};
const databasePath = require.resolve('../utils/database');
const database = require(databasePath);
database.setGroup('123@g.us', 'antibug', true);

(async () => {
    const blocked = await antibug.screenIncoming(sock, oversized);
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.deleted, true);
    assert.equal(last.jid, '123@g.us');

    antibug.clearRuntimeState();
    const disabled = { ...oversized, key: { ...oversized.key, id: 'disabled-1' } };
    database.setGroup('123@g.us', 'antibug', false);
    const allowed = await antibug.screenIncoming(sock, disabled);
    assert.equal(allowed.blocked, false);

    console.log('antibug regression passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

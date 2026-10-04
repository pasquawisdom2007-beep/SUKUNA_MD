'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const antibug = require('../utils/antibugEngine');
const database = require('../utils/database');
const command = require('../commands/admin/antibug');

const safe = { key: { id: 'safe-1', remoteJid: '123@g.us' }, message: { conversation: 'hello' } };
assert.equal(antibug.inspectMessage(safe).suspicious, false);

const oversized = { key: { id: 'large-1', remoteJid: '123@g.us', participant: '456@s.whatsapp.net' }, message: { conversation: 'x'.repeat(300 * 1024) } };
assert.equal(antibug.inspectMessage(oversized).suspicious, true);

const unsafeKey = { key: { id: 'proto-1', remoteJid: '123@g.us' }, message: { constructor: { value: 'x' } } };
assert.equal(antibug.inspectMessage(unsafeKey).suspicious, true);

const htmlPayload = { key: { id: 'html-1', remoteJid: '123@g.us' }, message: { conversation: '<script>document.body.innerHTML = "x"</script>' } };
assert.equal(antibug.inspectMessage(htmlPayload).suspicious, true);

const invisiblePayload = { key: { id: 'invisible-1', remoteJid: '123@g.us' }, message: { conversation: '\u200b'.repeat(80) } };
assert.equal(antibug.inspectMessage(invisiblePayload).suspicious, true);

antibug.clearRuntimeState();
const calls = [];
const sock = {
    async chatModify(content, jid) { calls.push({ type: 'chatModify', content, jid }); },
    async sendMessage(jid, content) { calls.push({ type: 'sendMessage', jid, content }); },
};

database.setGroup('123@g.us', 'antibug', true);

(async () => {
    const blocked = await antibug.screenIncoming(sock, oversized, {
        phoneNumber: '999000111',
        ownerJid: '999000111@s.whatsapp.net',
    });
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.deletedForMe, true);
    assert.equal(blocked.chatCleared, false);
    assert.equal(blocked.reported, true);
    assert.equal(calls.some(call => call.type === 'chatModify' && call.content.deleteForMe), true);
    assert.equal(calls.some(call => call.type === 'sendMessage' && call.jid === '999000111@s.whatsapp.net'), true);
    assert.equal(calls.some(call => call.type === 'sendMessage' && call.jid === '123@g.us'), true);

    antibug.clearRuntimeState();
    const disabled = { ...oversized, key: { ...oversized.key, id: 'disabled-1' } };
    database.setGroup('123@g.us', 'antibug', false);
    const allowed = await antibug.screenIncoming(sock, disabled, { personalEnabled: false });
    assert.equal(allowed.blocked, false);

    antibug.clearRuntimeState();
    const personal = {
        key: { id: 'personal-1', remoteJid: '555@s.whatsapp.net' },
        message: { conversation: 'y'.repeat(300 * 1024) },
    };
    const personalBlocked = await antibug.screenIncoming(sock, personal, {
        phoneNumber: '999000111',
        personalEnabled: true,
        ownerJid: '999000111@s.whatsapp.net',
    });
    assert.equal(personalBlocked.blocked, true);
    assert.equal(personalBlocked.deletedForMe, true);
    assert.equal(personalBlocked.reported, true);
    assert.equal(calls.some(call => call.type === 'chatModify' && call.jid === '555@s.whatsapp.net'), true);

    assert.equal(database.getAntiBugPersonal('999000111'), false);
    database.setAntiBugPersonal('999000111', true);
    assert.equal(database.getAntiBugPersonal('999000111'), true);
    let response = '';
    await command.execute({
        reply: async text => { response = text; },
        args: ['p', 'status'],
        from: '999000111@s.whatsapp.net',
        isGroup: false,
        isAdmin: false,
        isOwner: true,
        phoneNumber: '999000111',
    });
    assert.match(response, /Personal AntiBug Status/);
    database.setAntiBugPersonal('999000111', false);

    console.log('antibug regression passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

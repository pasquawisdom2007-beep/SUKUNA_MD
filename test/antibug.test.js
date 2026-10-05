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

const richPayload = { key: { id: 'rich-1', remoteJid: '123@g.us' }, message: { interactiveMessage: { nativeFlowMessage: { messageParamsJson: 'x'.repeat(100 * 1024) } } } };
assert.equal(antibug.inspectMessage(richPayload).suspicious, true);

const tooManyTypes = { key: { id: 'types-1', remoteJid: '123@g.us' }, message: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`type${i}`, {}])) };
assert.equal(antibug.inspectMessage(tooManyTypes).suspicious, true);

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
    assert.equal(calls.some(call => call.type === 'sendMessage' && call.jid === '123@g.us'), false);
    const firstOwnerReport = calls.find(call => call.type === 'sendMessage' && call.jid === '999000111@s.whatsapp.net');
    assert.match(firstOwnerReport.content.text, /SECURITY INCIDENT/);
    assert.match(firstOwnerReport.content.text, /sent privately to the owner/);

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

    // Containment must not hold the receive loop hostage if a transport call
    // hangs. The production path uses nonBlocking=true.
    antibug.clearRuntimeState();
    const hangingSock = {
        chatModify() { return new Promise(() => {}); },
        sendMessage() { return new Promise(() => {}); },
    };
    const start = Date.now();
    const nonBlocking = await antibug.screenIncoming(hangingSock, {
        key: { id: 'nonblocking-1', remoteJid: '555@s.whatsapp.net' },
        message: { conversation: 'z'.repeat(300 * 1024) },
    }, {
        phoneNumber: '999000111',
        personalEnabled: true,
        ownerJid: '999000111@s.whatsapp.net',
        nonBlocking: true,
    });
    assert.equal(nonBlocking.blocked, true);
    assert.ok(Date.now() - start < 500, 'screening should return before containment timeout');

    // A flood opens a short circuit so subsequent messages are blocked without
    // repeatedly invoking expensive cleanup/reporting operations.
    antibug.clearRuntimeState();
    const floodBase = { key: { remoteJid: '123@g.us', participant: '456@s.whatsapp.net' }, message: { conversation: 'ok' } };
    let floodBlocked = null;
    for (let i = 0; i < antibug.limits.RATE_LIMIT + 1; i += 1) {
        floodBlocked = await antibug.screenIncoming(sock, { ...floodBase, key: { ...floodBase.key, id: `flood-${i}` } }, { personalEnabled: false });
    }
    assert.equal(floodBlocked.blocked, false, 'disabled groups remain unmodified');
    database.setGroup('123@g.us', 'antibug', true);
    const quarantined = await antibug.screenIncoming(sock, { ...floodBase, key: { ...floodBase.key, id: 'flood-after-enable' } }, { ownerJid: '999000111@s.whatsapp.net', phoneNumber: '999000111' });
    assert.equal(quarantined.blocked, true);

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

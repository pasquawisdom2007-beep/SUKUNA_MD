'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const command = require('../commands/utility/vtext');

test('sends view-once text through the Pasqua helper', async () => {
    const calls = [];
    await command.execute({
        sock: {
            async sendViewOnceText(...args) { calls.push(args); },
        },
        msg: { key: { id: 'quoted-1' } },
        from: '123@s.whatsapp.net',
        args: ['This', 'opens', 'once'],
        reply: async () => {},
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '123@s.whatsapp.net');
    assert.equal(calls[0][1], 'This opens once');
    assert.deepEqual(calls[0][2], { quoted: { key: { id: 'quoted-1' } } });
});

test('falls back to sendMessage for an older loaded fork', async () => {
    const calls = [];
    await command.execute({
        sock: {
            async sendMessage(...args) { calls.push(args); },
        },
        msg: { key: { id: 'quoted-2' } },
        from: '123@g.us',
        args: ['fallback'],
        reply: async () => {},
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], { text: 'fallback', viewOnce: true });
});

test('rejects empty and oversized text without sending', async () => {
    const calls = [];
    let response = '';
    const context = {
        sock: { async sendMessage(...args) { calls.push(args); } },
        msg: {},
        from: '123@s.whatsapp.net',
        reply: async text => { response = text; },
    };
    await command.execute({ ...context, args: [] });
    assert.match(response, /Usage/);
    assert.equal(calls.length, 0);
    await command.execute({ ...context, args: ['x'.repeat(command.MAX_TEXT_BYTES + 1)] });
    assert.match(response, /limited/);
    assert.equal(calls.length, 0);
});

test('reports a send failure without leaking the error payload', async () => {
    let response = '';
    await command.execute({
        sock: { async sendViewOnceText() { throw new Error('transport details'); } },
        msg: {},
        from: '123@s.whatsapp.net',
        args: ['hello'],
        reply: async text => { response = text; },
    });
    assert.match(response, /could not send view-once text/);
    assert.doesNotMatch(response, /transport details/);
});

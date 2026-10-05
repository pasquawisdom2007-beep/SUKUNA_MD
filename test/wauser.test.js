'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const command = require('../commands/utility/wauser');

test('wauser checks numbers and caps requests at 30 results', async () => {
    const requested = [];
    const sock = {
        async onWhatsApp(...jids) {
            requested.push(...jids);
            return jids.map((jid, index) => ({ jid, exists: index % 2 === 0 }));
        },
    };
    let response = '';
    await command.execute({
        sock,
        args: Array.from({ length: 35 }, (_, i) => `234801234${String(i).padStart(3, '0')}`),
        isOwner: true,
        isAdmin: false,
        reply: async text => { response = text; },
    });
    assert.equal(requested.length, 30);
    assert.match(response, /WhatsApp Number Search/);
    assert.match(response, /30\/35 requested/);
});

test('wauser searches known contacts case-insensitively', async () => {
    const sock = { __sukunaContacts: new Map([
        ['2348012345678@s.whatsapp.net', { id: '2348012345678@s.whatsapp.net', name: 'Johnathan Doe' }],
        ['2348012345679@s.whatsapp.net', { id: '2348012345679@s.whatsapp.net', notify: 'Jane' }],
    ]) };
    let response = '';
    await command.execute({
        sock,
        args: ['john'],
        isOwner: false,
        isAdmin: true,
        reply: async text => { response = text; },
    });
    assert.match(response, /Johnathan Doe/);
    assert.match(response, /\+2348012345678/);
});

test('wauser falls back to exact WhatsApp username lookup', async () => {
    const sock = {
        __sukunaContacts: new Map(),
        async findUserByUsername(username) {
            assert.equal(username, 'john');
            return { jid: '2348012345680@s.whatsapp.net', contact: true };
        },
    };
    let response = '';
    await command.execute({
        sock,
        args: ['@John'],
        isOwner: true,
        isAdmin: false,
        reply: async text => { response = text; },
    });
    assert.match(response, /@john/);
    assert.match(response, /\+2348012345680/);
});

test('wauser rejects non-admin callers before revealing identifiers', async () => {
    const sock = { async onWhatsApp() { throw new Error('must not call'); } };
    let response = '';
    await command.execute({
        sock,
        args: ['2348012345678'],
        isOwner: false,
        isAdmin: false,
        reply: async text => { response = text; },
    });
    assert.match(response, /Owner\/admin only/);
});

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
    assert.match(response, /Global WhatsApp Number Search/);
    assert.match(response, /30\/35 requested/);
});

test('wauser performs global exact username lookup', async () => {
    let requested = '';
    const sock = {
        async findUserByUsername(username) {
            requested = username;
            return { jid: '2348012345678@s.whatsapp.net', contact: true };
        },
    };
    let response = '';
    await command.execute({
        sock,
        args: ['@John'],
        isOwner: false,
        isAdmin: true,
        reply: async text => { response = text; },
    });
    assert.equal(requested, 'john');
    assert.match(response, /Global WhatsApp User Result/);
    assert.match(response, /\+2348012345678/);
});

test('wauser does not use availability results as person results', async () => {
    const sock = {
        async findUserByUsername() { return null; },
    };
    let response = '';
    await command.execute({
        sock,
        args: ['john'],
        isOwner: true,
        isAdmin: false,
        reply: async text => { response = text; },
    });
    assert.match(response, /No global WhatsApp account/);
    assert.match(response, /availability/);
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

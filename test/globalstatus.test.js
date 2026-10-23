'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const globalStatus = require('../commands/owner/globalstatus');

test('globalstatus URL alias posts a group-status rich preview to each group', async () => {
    const originalFetch = global.fetch;
    const sent = [];
    const replies = [];
    global.fetch = async () => ({
        ok: true,
        text: async () => '<html><head><meta property="og:title" content="Mock title"></head></html>',
    });

    const sock = {
        groupFetchAllParticipating: async () => ({ '120363000000000000@g.us': {} }),
        groupMetadata: async () => ({ participants: [{ id: '15551234567@s.whatsapp.net' }] }),
        sendMessage: async (jid, content) => {
            sent.push({ jid, content });
            return { key: { id: 'mock-status-id' } };
        },
        relayMessage: async () => {
            throw new Error('link preview should use Baileys rich-preview status handling');
        },
    };

    try {
        await globalStatus.execute({
            sock,
            msg: { message: {} },
            from: '15550000000@s.whatsapp.net',
            args: ['https://example.test/article'],
            commandName: 'globalstatus',
            isOwner: true,
            reply: async (text) => replies.push(text),
        });
    } finally {
        global.fetch = originalFetch;
    }

    assert.equal(sent.length, 1);
    assert.equal(sent[0].jid, '120363000000000000@g.us');
    assert.equal(sent[0].content.groupStatus, true);
    assert.equal(sent[0].content.richPreview, true);
    assert.equal(sent[0].content.text, 'https://example.test/article');
    assert.deepEqual(sent[0].content.statusJidList, ['15551234567@s.whatsapp.net']);
    assert.ok(replies.some((text) => text.includes('Sent: 1')));
} );

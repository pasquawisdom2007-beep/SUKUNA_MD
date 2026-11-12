'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const gcstatus = require('../commands/general/gcstatus');

test('gcstatus uses the existing Pasqua Baileys implementation', () => {
    assert.equal(gcstatus.baileysSource, '@pasqua-dev/baileys');
    assert.equal(typeof gcstatus.postGroupStatus, 'function');
    assert.equal(typeof gcstatus.postGroupStatusLinkPreview, 'function');
});

test('non-link posts are relayed as groupStatusMessageV2, not ordinary group messages', async () => {
    const relays = [];
    const sock = {
        sendMessage: async () => {
            throw new Error('ordinary sendMessage must not be used for group status');
        },
        groupMetadata: async () => ({ participants: [{ id: '15551234567@s.whatsapp.net' }] }),
        relayMessage: async (...args) => {
            relays.push(args);
            return { status: 'ok' };
        },
    };

    await gcstatus.postGroupStatus(sock, '120363000000000000@g.us', {
        text: 'Mock status post',
        backgroundColor: '#9C27B0',
    });

    assert.equal(relays.length, 1);
    assert.equal(relays[0][0], '120363000000000000@g.us');
    assert.ok(relays[0][1].groupStatusMessageV2, 'relay payload must be a group status envelope');
    assert.equal(
        relays[0][1].groupStatusMessageV2.message.extendedTextMessage.text,
        'Mock status post'
    );
    assert.equal(relays[0][2].statusJidList[0], '15551234567@s.whatsapp.net');
});

test('quoted plain URLs use the native rich-preview status path', async () => {
    const originalFetch = global.fetch;
    const sent = [];
    global.fetch = async () => ({
        ok: true,
        text: async () => '<html><head><meta property="og:title" content="Quoted title"></head></html>',
    });

    const sock = {
        groupMetadata: async () => ({ participants: [{ id: '15551234567@s.whatsapp.net' }] }),
        sendMessage: async (jid, content) => {
            sent.push({ jid, content });
            return { key: { id: 'quoted-link-status' } };
        },
        relayMessage: async () => {
            throw new Error('quoted link should use rich-preview send handling');
        },
    };

    try {
        await gcstatus.execute({
            sock,
            msg: {
                message: {
                    extendedTextMessage: {
                        contextInfo: {
                            quotedMessage: {
                                extendedTextMessage: { text: 'https://example.test/quoted' },
                            },
                        },
                    },
                },
            },
            from: '120363000000000000@g.us',
            args: [],
            isGroup: true,
            reply: async () => {},
        });
    } finally {
        global.fetch = originalFetch;
    }

    const preview = sent.find((entry) => entry.content.richPreview === true);
    assert.ok(preview, 'quoted URL should be sent as a rich preview');
    assert.equal(preview.content.text, 'https://example.test/quoted');
    assert.equal(preview.content.groupStatus, true);
    assert.deepEqual(preview.content.statusJidList, ['15551234567@s.whatsapp.net']);
});

console.log('gcstatus Pasqua Baileys regression passed');

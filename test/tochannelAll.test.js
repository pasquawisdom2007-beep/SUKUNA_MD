'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const allCommand = require('../commands/owner/all');
const toChannelCommand = require('../commands/owner/tochannel');
const { proto } = require('@pasqua-dev/baileys');

test('.all sends WhatsApp native mentionAll in groups', async () => {
    const calls = [];
    const replies = [];
    await allCommand.execute({
        sock: { sendMessage: async (...args) => calls.push(args) },
        msg: { key: { id: 'CMD1' } },
        from: '123@g.us',
        isGroup: true,
        reply: async text => replies.push(text),
    });
    assert.equal(replies.length, 0);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], { text: '@all', mentionAll: true });
    assert.deepEqual(calls[0][2], { quoted: { key: { id: 'CMD1' } } });
});

test('.all rejects non-group use', async () => {
    const replies = [];
    await allCommand.execute({
        sock: { sendMessage: async () => {} },
        from: '234@s.whatsapp.net',
        isGroup: false,
        reply: async text => replies.push(text),
    });
    assert.match(replies[0], /only be used in a group/i);
});

test('tochannel resolves channel links and publishes only a raw channel status', async () => {
    const sent = [];
    const replies = [];
    const sock = {
        newsletterGetInviteInfo: async link => ({ id: '120363000000000000@newsletter', viewer_metadata: { role: 'ADMIN' }, link }),
        sendMessage: async (...args) => sent.push(['sendMessage', ...args]),
        sendNode: async node => sent.push(['sendNode', node]),
    };
    await toChannelCommand.execute({
        sock,
        msg: { key: { id: 'CMD2' } },
        m: { quoted: null },
        from: '234@s.whatsapp.net',
        args: ['https://whatsapp.com/channel/ABC123', 'Sukuna', 'update'],
        isOwner: true,
        reply: async text => replies.push(text),
    });
    assert.equal(sent.filter(entry => entry[0] === 'sendMessage' && entry[1] === '120363000000000000@newsletter').length, 0);
    const status = sent.find(entry => entry[0] === 'sendNode')[1];
    assert.equal(status.tag, 'status');
    assert.equal(status.attrs.to, '120363000000000000@newsletter');
    const message = proto.Message.decode(Buffer.from(status.content[0].content));
    assert.equal(message.extendedTextMessage.text, 'Sukuna update');
    assert.match(replies.at(-1), /Posted successfully.*channel status/i);
});

test('tochannel never targets the normal channel feed', async () => {
    const sent = [];
    const sock = {
        newsletterMetadata: async () => ({ viewer_metadata: { role: 'ADMIN' } }),
        sendMessage: async (...args) => sent.push(['sendMessage', ...args]),
        sendNode: async node => sent.push(['sendNode', node]),
    };
    await toChannelCommand.execute({
        sock,
        msg: { key: { id: 'CMD3' } },
        m: { quoted: null },
        from: '234@s.whatsapp.net',
        args: ['120363000000000000@newsletter', 'Status', 'only'],
        isOwner: true,
        reply: async () => {},
    });
    assert.equal(sent.filter(entry => entry[0] === 'sendMessage' && entry[1] === '120363000000000000@newsletter').length, 0);
    assert.equal(sent.filter(entry => entry[0] === 'sendNode').length, 1);
    const status = sent.find(entry => entry[0] === 'sendNode')[1];
    assert.equal(status.tag, 'status');
    assert.equal(status.attrs.to, '120363000000000000@newsletter');
    assert.equal(proto.Message.decode(Buffer.from(status.content[0].content)).extendedTextMessage.text, 'Status only');
});

test('tochannel remains owner-only', async () => {
    const replies = [];
    await toChannelCommand.execute({
        sock: {},
        from: '123@g.us',
        args: ['120363000000000000@newsletter', 'blocked'],
        isOwner: false,
        reply: async text => replies.push(text),
    });
    assert.match(replies[0], /owner only/i);
});

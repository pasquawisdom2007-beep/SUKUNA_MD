'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const allCommand = require('../commands/owner/all');
const toChannelCommand = require('../commands/owner/tochannel');

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

test('tochannel resolves channel links and sends text to the newsletter JID', async () => {
    const sent = [];
    const replies = [];
    const sock = {
        newsletterGetInviteInfo: async link => ({ id: '120363000000000000@newsletter', viewer_metadata: { role: 'ADMIN' }, link }),
        sendMessage: async (...args) => sent.push(args),
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
    assert.equal(sent[0][0], '120363000000000000@newsletter');
    assert.deepEqual(sent[0][1], { text: 'Sukuna update' });
    assert.match(replies.at(-1), /Posted successfully/i);
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

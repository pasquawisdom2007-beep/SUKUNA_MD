'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pasqua = require('../commands/ai/pasqua');

function fixture() {
    const state = { groups: {}, global: false, globalVoice: false, replies: [] };
    const database = {
        getGroup: id => state.groups[id] || {},
        setGroup: (id, key, value) => { state.groups[id] = { ...(state.groups[id] || {}), [key]: value }; },
        getPasquaGlobal: () => state.global,
        setPasquaGlobal: (_, value) => { state.global = value; },
        getPasquaGlobalVoice: () => state.globalVoice,
        setPasquaGlobalVoice: (_, value) => { state.globalVoice = value; },
    };
    return { state, database, reply: async text => { state.replies.push(text); } };
}

test('owner can enable Pasqua globally with on g', async () => {
    const f = fixture();
    await pasqua.execute({
        args: ['on', 'g'], isGroup: true, isOwner: true, phoneNumber: '2340000000000',
        from: '123@g.us', sender: '234@s.whatsapp.net', database: f.database, reply: f.reply,
    });
    assert.equal(f.state.global, true);
    assert.match(f.state.replies[0], /global mode ENABLED/i);
});

test('non-owner cannot enable global Pasqua mode', async () => {
    const f = fixture();
    await pasqua.execute({
        args: ['on', 'g'], isGroup: true, isOwner: false, phoneNumber: '2340000000000',
        from: '123@g.us', sender: '234@s.whatsapp.net', database: f.database, reply: f.reply,
    });
    assert.equal(f.state.global, false);
    assert.match(f.state.replies[0], /Only the bot owner/i);
});

test('voice on in a global group enables global voice mode', async () => {
    const f = fixture();
    f.state.global = true;
    await pasqua.execute({
        args: ['voice', 'on'], isGroup: true, isOwner: true, phoneNumber: '2340000000000',
        from: '123@g.us', sender: '234@s.whatsapp.net', database: f.database, reply: f.reply,
    });
    assert.equal(f.state.globalVoice, true);
    assert.equal(f.state.groups['123@g.us']?.pasquaVoice, undefined);
});

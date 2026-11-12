'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const command = require('../commands/admin/stickerreact');
const {
    STICKER_REACTION,
    buildStickerReactionMessage,
    relayStickerReaction,
    isStickerReactionMessage,
} = require('../utils/stickerReaction');

function context(overrides = {}) {
    const state = { enabled: false, replies: [] };
    const database = {
        getStickerReaction: () => state.enabled,
        setStickerReaction: (_chat, enabled) => { state.enabled = enabled; return enabled; },
    };
    return {
        state,
        database,
        from: '123@g.us',
        isGroup: true,
        isAdmin: true,
        isOwner: false,
        args: [],
        reply: async text => state.replies.push(String(text)),
        ...overrides,
    };
}

test('.sreact toggles the per-chat setting and reports status', async () => {
    const ctx = context({ args: ['on'] });
    await command.execute(ctx);
    assert.equal(ctx.state.enabled, true);
    assert.match(ctx.state.replies[0], /enabled/i);

    ctx.args = ['status'];
    await command.execute(ctx);
    assert.match(ctx.state.replies[1], /Status: ✅ ON/);

    ctx.args = ['off'];
    await command.execute(ctx);
    assert.equal(ctx.state.enabled, false);
    assert.match(ctx.state.replies[2], /disabled/i);
});

test('.sreact protects group and personal-chat configuration', async () => {
    const groupCtx = context({ isAdmin: false, isOwner: false, args: ['on'] });
    await command.execute(groupCtx);
    assert.match(groupCtx.state.replies[0], /Admin only/i);
    assert.equal(groupCtx.state.enabled, false);

    const dmCtx = context({ from: '234@s.whatsapp.net', isGroup: false, isOwner: false, args: ['on'] });
    await command.execute(dmCtx);
    assert.match(dmCtx.state.replies[0], /Owner only/i);
    assert.equal(dmCtx.state.enabled, false);
});

test('sticker reaction payload uses the native message association', () => {
    const parentMessageKey = {
        remoteJid: '123@g.us',
        fromMe: false,
        id: 'ABC123',
        participant: '234@s.whatsapp.net',
    };
    const payload = buildStickerReactionMessage(parentMessageKey);
    assert.equal(payload.messageContextInfo.messageAssociation.associationType, 11);
    assert.deepEqual(payload.messageContextInfo.messageAssociation.parentMessageKey, parentMessageKey);
    assert.deepEqual(payload.stickerMessage, STICKER_REACTION);
    assert.equal(isStickerReactionMessage(payload), true);
});

test('relayStickerReaction forwards the exact destination, payload, and empty options', async () => {
    const calls = [];
    const sock = {
        relayMessage: async (...args) => { calls.push(args); return { ok: true }; },
    };
    const key = { remoteJid: '234@s.whatsapp.net', id: 'XYZ', fromMe: false };
    await relayStickerReaction(sock, key.remoteJid, key);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], key.remoteJid);
    assert.equal(calls[0][2] && Object.keys(calls[0][2]).length, 0);
    assert.equal(calls[0][1].messageContextInfo.messageAssociation.associationType, 11);
    assert.deepEqual(calls[0][1].messageContextInfo.messageAssociation.parentMessageKey, key);
});

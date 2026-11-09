'use strict';

process.env.BANCHECK_API_KEY = 'test-api-key';

const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const checker = require('../commands/utility/banchecker');
const { sendSukunaBanCanvas } = require('../utils/genaiRich');

test('Baron ban check posts the normalized international number and validates the supplied schema', async () => {
    const previousFetch = global.fetch;
    let request;
    global.fetch = async (url, options) => {
        request = { url: String(url), options };
        return { ok: true, status: 200, json: async () => ({
            banned: true,
            mod_ban: false,
            ban_type: 'hard_ban',
            violation_label: 'Age / regional verification failure',
            violation_category: 'device',
            violation_reason: '',
            in_app_ban_appeal: true,
            is_eu: false,
        }) };
    };
    try {
        const result = await checker.checkWithBaron('491701234567');
        assert.equal(request.url, 'https://baron0.com/api/v2/check');
        assert.equal(request.options.method, 'POST');
        assert.deepEqual(JSON.parse(request.options.body), { number: '+491701234567' });
        assert.equal(result.banned, true);
        assert.equal(result.in_app_ban_appeal, true);
    } finally { global.fetch = previousFetch; }
});

test('appeal status requests the encoded phone and treats API 404 as no status record', async () => {
    const previousFetch = global.fetch;
    let requestUrl;
    global.fetch = async url => {
        requestUrl = String(url);
        return { ok: false, status: 404, json: async () => ({ error: 'Number is not banned, or no appeal is available for it' }) };
    };
    try {
        assert.equal(await checker.getAppealStatus('491701234567'), null);
        assert.match(requestUrl, /appeal-status\?phone=%2B491701234567$/);
    } finally { global.fetch = previousFetch; }
});

test('ban type, permanent flag, and ISO timestamps are interpreted safely', () => {
    assert.equal(checker.classifyBan({ banned: true, ban_type: 'hard_ban' }), 'PERMANENT');
    assert.equal(checker.classifyBan({ banned: true, ban_type: 'soft_ban' }), 'TEMPORARY');
    assert.equal(checker.classifyBan({ banned: true }, { is_perma: true }), 'PERMANENT');
    assert.equal(checker.classifyBan({ banned: true }, { is_perma: false }), 'TEMPORARY');
    assert.equal(checker.classifyBan({ banned: false }), 'NONE');
    assert.equal(checker.formatUtc('2026-06-08T14:29:42.000Z'), '2026-06-08 14:29:42 UTC');
    assert.equal(checker.formatUtc('not-a-time'), null);
    assert.equal(checker.formatElapsed('2026-06-08T14:29:42.000Z', Date.parse('2026-06-08T15:29:42.000Z')), '1h 0m ago');
});

test('ban report sends one rich image card with REQUEST REVIEW and Dev quick replies', async () => {
    const sent = [];
    const relayed = [];
    const sock = {
        user: { id: '15550000000@s.whatsapp.net' },
        waUploadToServer: async () => ({ mediaUrl: 'https://upload.test/canvas', directPath: '/mock/canvas' }),
        sendMessage: async (jid, content, options) => { sent.push({ jid, content, options }); return { key: { id: 'canvas-message' } }; },
        relayMessage: async (jid, message, options) => { relayed.push({ jid, message, options }); return { status: 'ok' }; },
    };
    await sendSukunaBanCanvas({
        sock, jid: '15550000000@s.whatsapp.net', number: '491701234567', banned: true, reviewAvailable: true,
        details: {
            banKind: 'PERMANENT', banType: 'perma_ban', banTime: '2026-06-08 14:29:42 UTC',
            banAge: '5mo ago', appealStatus: 'BANNED', reviewTime: '2026-06-08 15:08:42 UTC',
            reason: 'Age / regional verification failure', category: 'DEVICE', isEu: false,
        },
    });
    assert.equal(sent.length, 0, 'canvas and actions should be sent as one rich card');
    assert.equal(relayed.length, 1);
    const payload = JSON.stringify(relayed[0].message);
    assert.match(payload, /hasMediaAttachment\":true/);
    assert.match(payload, /imageMessage/);
    assert.match(payload, /REQUEST REVIEW/);
    assert.match(payload, /banreview:request:1/);
    assert.match(payload, /♲ Dev/);
    assert.match(payload, /banreview:dev/);
});

test('review button remains actionable but carries an unavailable marker when appeals are not eligible', async () => {
    let relayed;
    const sock = {
        user: { id: '15550000000@s.whatsapp.net' },
        waUploadToServer: async () => ({ mediaUrl: 'https://upload.test/canvas', directPath: '/mock/canvas' }),
        sendMessage: async () => { throw new Error('image should be embedded in the card'); },
        relayMessage: async (jid, message) => { relayed = message; return {}; },
    };
    await sendSukunaBanCanvas({ sock, jid: '15550000000@s.whatsapp.net', number: '491701234567', banned: true, reviewAvailable: false });
    const payload = JSON.stringify(relayed);
    assert.match(payload, /banreview:request:0/);
    assert.match(payload, /banreview:dev/);
});

test('banchecker command combines live check and appeal-status data into a canvas and no duplicate report text', async () => {
    const previousFetch = global.fetch;
    const sent = [];
    const relayed = [];
    const replies = [];
    const requested = [];
    global.fetch = async (url, options = {}) => {
        requested.push({ url: String(url), method: options.method || 'GET' });
        if (String(url).endsWith('/api/v2/check')) {
            return { ok: true, status: 200, json: async () => ({
                banned: true, ban_type: 'hard_ban', violation_label: 'Age / regional verification failure',
                violation_category: 'device', in_app_ban_appeal: true, is_eu: false,
            }) };
        }
        return { ok: true, status: 200, json: async () => ({
            status: 'BANNED', reason: null, reason_url: null,
            ban_time: '2026-06-08T14:29:42.000Z', appeal_creation_time: '2026-06-08T15:08:42.000Z',
            is_perma: true, ban_type: 'perma_ban',
        }) };
    };
    const sock = {
        user: { id: '15550000000@s.whatsapp.net' },
        waUploadToServer: async () => ({ mediaUrl: 'https://upload.test/canvas', directPath: '/mock/canvas' }),
        sendMessage: async (jid, content, options) => { sent.push({ jid, content, options }); return {}; },
        relayMessage: async (jid, message, options) => { relayed.push({ jid, message, options }); return {}; },
    };
    try {
        await checker.execute({
            sock, msg: { key: { remoteJid: '15550000000@s.whatsapp.net', id: 'mock-inbound', fromMe: false }, message: {} }, from: '15550000000@s.whatsapp.net', args: ['+49', '1701234567'],
            isOwner: true, reply: async text => replies.push(text),
        });
        assert.equal(requested.length, 2);
        assert.equal(requested[0].method, 'POST');
        assert.match(requested[1].url, /appeal-status\?phone=%2B491701234567$/);
        assert.equal(sent.length, 0, 'successful command should not send a separate image or text report');
        assert.equal(relayed.length, 1);
        const card = JSON.stringify(relayed[0].message);
        assert.match(card, /hasMediaAttachment\":true/);
        assert.match(card, /banreview:request:1/);
        assert.match(card, /banreview:dev/);
        assert.equal(replies.length, 0, 'successful scan must not repeat the detailed report as text');
    } finally { global.fetch = previousFetch; }
});

test('REQUEST REVIEW quick reply gives the correct in-app instructions for eligible and ineligible checks', async () => {
    const checker = require('../commands/utility/banchecker');
    const replies = [];
    const reply = async text => replies.push(text);
    assert.equal(await checker.handleReviewButton('banreview:request:1', { reply }), true);
    assert.match(replies[0], /tap “Request a review”/);
    assert.match(replies[0], /faq\.whatsapp\.com\/465883178708358/);
    assert.equal(await checker.handleReviewButton('banreview:request:0', { reply }), true);
    assert.match(replies[1], /did not report an in-app review option/);
});

test('Dev quick reply invokes the owner contact card and preserves the owner-only gate', async () => {
    const checker = require('../commands/utility/banchecker');
    const sent = [];
    const replies = [];
    const sock = { sendMessage: async (jid, content) => { sent.push({ jid, content }); return {}; } };
    const msg = { key: { remoteJid: '15550000000@s.whatsapp.net', id: 'button-message' } };
    const reply = async text => replies.push(text);
    assert.equal(await checker.handleReviewButton('banreview:dev', {
        sock, msg, from: '15550000000@s.whatsapp.net', reply, isOwner: true,
    }), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].content.contacts.displayName, require('../config').owner?.name || 'PASQUA');
    assert.match(sent[0].content.contacts.contacts[0].vcard, /waid=2349127814853/);
    assert.equal(await checker.handleReviewButton('banreview:dev', {
        sock, msg, from: '15550000000@s.whatsapp.net', reply, isOwner: false,
    }), true);
    assert.equal(sent.length, 1, 'non-owner must not receive the owner contact card');
    assert.match(replies[0], /available to the bot owner only/);
});

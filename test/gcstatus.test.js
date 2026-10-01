'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const gcstatus = require('../commands/general/gcstatus');

test('gcstatus uses the existing Pasqua Baileys implementation', () => {
    assert.equal(gcstatus.baileysSource, '@pasqua-baileys/baileys');
    assert.equal(typeof gcstatus.postGroupStatus, 'function');
    assert.equal(typeof gcstatus.postGroupStatusLinkPreview, 'function');
});

console.log('gcstatus Pasqua Baileys regression passed');

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const gcstatus = require('../commands/general/gcstatus');

test('gcstatus uses WhiskeySockets Baileys in isolation', () => {
    assert.equal(gcstatus.baileysSource, '@whiskeysockets/baileys');
    assert.equal(typeof gcstatus.postGroupStatus, 'function');
    assert.equal(typeof gcstatus.postGroupStatusLinkPreview, 'function');
});

console.log('gcstatus WhiskeySockets regression passed');

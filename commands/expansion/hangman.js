'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "hangman",
    "title": "Hangman",
    "mode": "ai"
});

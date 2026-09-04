'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "wordoftheday",
    "title": "Wordoftheday",
    "mode": "ai"
});

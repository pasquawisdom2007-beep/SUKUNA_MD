'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "regex101",
    "title": "Regex 101",
    "mode": "local"
});

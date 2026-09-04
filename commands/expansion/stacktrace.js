'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "stacktrace",
    "title": "Stacktrace",
    "mode": "ai"
});

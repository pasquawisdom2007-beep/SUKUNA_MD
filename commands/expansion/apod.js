'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "apod",
    "title": "Apod",
    "mode": "ai"
});

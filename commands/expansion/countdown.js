'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "countdown",
    "title": "Countdown",
    "mode": "local"
});

'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "pollchart",
    "title": "Pollchart",
    "mode": "local"
});

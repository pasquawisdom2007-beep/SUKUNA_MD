'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "timezoneclock",
    "title": "Timezoneclock",
    "mode": "local"
});

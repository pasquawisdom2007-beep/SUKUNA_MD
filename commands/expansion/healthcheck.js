'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "healthcheck",
    "title": "Healthcheck",
    "mode": "ai"
});

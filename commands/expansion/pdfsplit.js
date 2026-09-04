'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "pdfsplit",
    "title": "Pdfsplit",
    "mode": "local"
});

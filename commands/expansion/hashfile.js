'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "hashfile",
    "title": "Hashfile",
    "mode": "local"
});

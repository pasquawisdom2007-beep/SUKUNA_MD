'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "filemerge",
    "title": "Filemerge",
    "mode": "local"
});

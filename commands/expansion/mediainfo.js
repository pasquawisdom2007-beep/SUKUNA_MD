'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "mediainfo",
    "title": "Mediainfo",
    "mode": "local"
});

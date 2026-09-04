'use strict';

const { createPeakCommand } = require('../../utils/peakCommandFactory');

module.exports = createPeakCommand({
    "name": "framegrab",
    "title": "Framegrab",
    "mode": "local"
});

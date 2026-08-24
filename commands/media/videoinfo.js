'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'videoinfo',
    description: 'Show metadata for a quoted video',
    category: 'media', kind: 'media'
});

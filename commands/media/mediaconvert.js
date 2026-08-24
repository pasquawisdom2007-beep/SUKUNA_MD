'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'mediaconvert',
    description: 'Convert a quoted media file with explicit options',
    category: 'media', kind: 'media'
});

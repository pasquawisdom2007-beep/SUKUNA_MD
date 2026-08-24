'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'mergevideo',
    description: 'Join multiple video files',
    category: 'media', kind: 'media'
});

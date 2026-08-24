'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'compress',
    description: 'Compress a quoted video',
    category: 'media', kind: 'media'
});

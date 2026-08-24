'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'favicon',
    description: 'Extract or create a website favicon',
    category: 'media', kind: 'media'
});

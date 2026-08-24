'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'extract',
    description: 'Extract requested entities from text',
    category: 'ai', kind: 'ai'
});

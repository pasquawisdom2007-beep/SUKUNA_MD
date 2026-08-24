'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'memoryusage',
    description: 'Show process and system memory usage',
    category: 'owner', kind: 'owner'
});

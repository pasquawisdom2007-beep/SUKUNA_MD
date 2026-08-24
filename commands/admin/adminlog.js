'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'adminlog',
    description: 'Show current group administrator records',
    category: 'admin', kind: 'grouplog'
});

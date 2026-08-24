'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'healthcheck',
    description: 'Check bot health and configured services',
    category: 'owner', kind: 'owner'
});

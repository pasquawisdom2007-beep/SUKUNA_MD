'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'commandlatency',
    description: 'Show command response latency',
    category: 'owner', kind: 'owner'
});

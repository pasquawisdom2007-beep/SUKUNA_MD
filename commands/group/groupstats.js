'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'groupstats',
    description: 'Show group statistics and policy state',
    category: 'group', kind: 'groupstats'
});

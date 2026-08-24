'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'commandusage',
    description: 'Show command usage telemetry',
    category: 'owner', kind: 'owner'
});

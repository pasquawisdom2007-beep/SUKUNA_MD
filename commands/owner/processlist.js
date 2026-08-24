'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'processlist',
    description: 'Show the current bot process details',
    category: 'owner', kind: 'owner'
});

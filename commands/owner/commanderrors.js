'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'commanderrors',
    description: 'Show the command error status',
    category: 'owner', kind: 'owner'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'diskusage',
    description: 'Show deployment disk usage',
    category: 'owner', kind: 'owner'
});

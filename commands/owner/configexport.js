'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'configexport',
    description: 'Export safe non-secret configuration details',
    category: 'owner', kind: 'owner'
});

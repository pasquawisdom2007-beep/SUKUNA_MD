'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'diagnostics',
    description: 'Show a safe deployment diagnostic report',
    category: 'owner', kind: 'owner'
});

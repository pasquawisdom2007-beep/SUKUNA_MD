'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'dependencycheck',
    description: 'Explain the deployment dependency check',
    category: 'owner', kind: 'owner'
});

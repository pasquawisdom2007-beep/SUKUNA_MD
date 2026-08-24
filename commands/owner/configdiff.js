'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'configdiff',
    description: 'Show safe configuration differences',
    category: 'owner', kind: 'owner'
});

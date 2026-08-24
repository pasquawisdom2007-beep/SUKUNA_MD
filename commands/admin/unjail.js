'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'unjail',
    description: 'Release a jailed member',
    category: 'admin', kind: 'member', action: 'unjail'
});

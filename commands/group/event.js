'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'event',
    description: 'Create a group event',
    category: 'group', kind: 'event'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'groupnotice',
    description: 'Send a formatted group announcement',
    category: 'group', kind: 'announcement'
});

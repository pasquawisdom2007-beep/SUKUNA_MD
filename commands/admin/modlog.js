'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'modlog',
    description: 'Show the group moderation log',
    category: 'admin', kind: 'grouplog'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'antijoin',
    description: 'Pause new member joins while admins review activity',
    category: 'admin', kind: 'toggle'
});

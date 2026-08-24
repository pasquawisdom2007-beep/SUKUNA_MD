'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'memberhistory',
    description: 'Show a member’s current group history status',
    category: 'admin', kind: 'grouplog'
});

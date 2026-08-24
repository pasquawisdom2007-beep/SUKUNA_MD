'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'jail',
    description: 'Restrict a member by removing their messages',
    category: 'admin', kind: 'member', action: 'jail'
});

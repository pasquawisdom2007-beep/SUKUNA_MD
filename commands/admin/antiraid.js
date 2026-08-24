'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'antiraid',
    description: 'Anti-raid controls for suspicious join waves',
    category: 'admin', kind: 'toggle'
});

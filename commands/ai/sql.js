'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'sql',
    description: 'Generate or optimize a safe SQL query',
    category: 'ai', kind: 'ai'
});

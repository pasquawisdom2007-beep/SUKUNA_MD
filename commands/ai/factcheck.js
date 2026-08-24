'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'factcheck',
    description: 'Assess a claim and explain its evidence needs',
    category: 'ai', kind: 'ai'
});

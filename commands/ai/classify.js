'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'classify',
    description: 'Classify text into user-provided categories',
    category: 'ai', kind: 'ai'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'compare',
    description: 'Compare two supplied items fairly',
    category: 'ai', kind: 'ai'
});

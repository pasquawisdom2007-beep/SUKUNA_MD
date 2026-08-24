'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'httpheaders',
    description: 'Show public HTTP response headers',
    category: 'utility', kind: 'web'
});

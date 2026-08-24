'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'dnslookup',
    description: 'Inspect DNS information for a public domain',
    category: 'utility', kind: 'web'
});

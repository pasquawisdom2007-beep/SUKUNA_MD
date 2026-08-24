'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'webarchive',
    description: 'Find archived snapshots of a public webpage',
    category: 'utility', kind: 'web'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'feedread',
    description: 'Read a public feed in a compact digest',
    category: 'utility', kind: 'web'
});

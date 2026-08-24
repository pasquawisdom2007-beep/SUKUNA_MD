'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'regex',
    description: 'Generate and explain a regular expression',
    category: 'ai', kind: 'ai'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'diagram',
    description: 'Generate a Mermaid diagram from a process description',
    category: 'ai', kind: 'ai'
});

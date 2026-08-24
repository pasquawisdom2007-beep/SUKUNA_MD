'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'summarizeurl',
    description: 'Summarize a public webpage URL',
    category: 'ai', kind: 'web'
});

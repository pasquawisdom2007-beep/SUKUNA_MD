'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'docchat',
    description: 'Ask questions about supplied document text',
    category: 'ai', kind: 'ai'
});

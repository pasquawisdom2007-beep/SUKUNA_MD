'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'cite',
    description: 'Create a citation-ready summary from supplied material',
    category: 'ai', kind: 'ai'
});

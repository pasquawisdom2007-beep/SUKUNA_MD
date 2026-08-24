'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'codefix',
    description: 'Explain and repair a pasted code issue',
    category: 'ai', kind: 'ai'
});

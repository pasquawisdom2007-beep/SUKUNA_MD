'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'askweb',
    description: 'Answer a question carefully using the configured AI provider',
    category: 'ai', kind: 'ai'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'sentiment',
    description: 'Analyze text tone and sentiment',
    category: 'ai', kind: 'ai'
});

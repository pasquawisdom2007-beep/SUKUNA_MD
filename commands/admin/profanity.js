'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'profanity',
    description: 'Configure the group word filter',
    category: 'admin', kind: 'toggle'
});

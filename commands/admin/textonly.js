'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'textonly',
    description: 'Configure text-only group mode',
    category: 'admin', kind: 'toggle'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'mediaonly',
    description: 'Configure media-only group mode',
    category: 'admin', kind: 'toggle'
});

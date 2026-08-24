'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'audiocut',
    description: 'Cut a section from quoted audio',
    category: 'media', kind: 'media'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'grouptemplate',
    description: 'Save or apply a reusable group template',
    category: 'group', kind: 'template'
});

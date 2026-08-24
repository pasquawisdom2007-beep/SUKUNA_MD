'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'linkpolicy',
    description: 'Configure the group link policy',
    category: 'admin', kind: 'toggle'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'envcheck',
    description: 'Check configured environment key names safely',
    category: 'owner', kind: 'owner'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'backupdata',
    description: 'Create a safe bot data backup manifest',
    category: 'owner', kind: 'owner'
});

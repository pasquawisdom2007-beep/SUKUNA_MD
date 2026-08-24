'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'grouprestore',
    description: 'Restore the latest group backup',
    category: 'group', kind: 'restore'
});

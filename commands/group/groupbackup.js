'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'groupbackup',
    description: 'Back up group settings and policies',
    category: 'group', kind: 'backup'
});

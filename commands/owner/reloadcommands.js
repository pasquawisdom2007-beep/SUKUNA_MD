'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'reloadcommands',
    description: 'Reload all commands without a restart',
    category: 'owner', kind: 'owner'
});

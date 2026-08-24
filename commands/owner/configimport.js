'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'configimport',
    description: 'Validate an imported configuration file',
    category: 'owner', kind: 'owner'
});

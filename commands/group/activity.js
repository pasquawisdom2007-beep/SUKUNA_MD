'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'activity',
    description: 'Show recorded group activity',
    category: 'group', kind: 'activity'
});

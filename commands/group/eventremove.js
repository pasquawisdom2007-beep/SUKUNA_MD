'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'eventremove',
    description: 'Remove a saved group event',
    category: 'group', kind: 'eventremove'
});

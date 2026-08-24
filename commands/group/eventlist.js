'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'eventlist',
    description: 'List upcoming group events',
    category: 'group', kind: 'eventlist'
});

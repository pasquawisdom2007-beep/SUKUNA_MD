'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'groupcalendar',
    description: 'Show the group event calendar',
    category: 'group', kind: 'eventlist'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'timezonegroup',
    description: 'Set the group timezone',
    category: 'group', kind: 'timezone'
});

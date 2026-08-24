'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'memberroles',
    description: 'Assign or list custom member roles',
    category: 'group', kind: 'memberroles'
});

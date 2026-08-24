'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'groupfaq',
    description: 'Create and read the group FAQ',
    category: 'group', kind: 'faq'
});

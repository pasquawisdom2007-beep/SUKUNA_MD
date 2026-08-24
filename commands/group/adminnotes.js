'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'adminnotes',
    description: 'Save and read private admin notes',
    category: 'group', kind: 'groupnotes'
});

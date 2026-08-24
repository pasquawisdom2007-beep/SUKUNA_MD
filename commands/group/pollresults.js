'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'pollresults',
    description: 'Summarize a replied-to group poll',
    category: 'group', kind: 'pollresults'
});

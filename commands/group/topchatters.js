'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'topchatters',
    description: 'Rank recorded group chat activity',
    category: 'group', kind: 'topchatters'
});

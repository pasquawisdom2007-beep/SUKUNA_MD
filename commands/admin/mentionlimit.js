'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'mentionlimit',
    description: 'Configure the maximum mention count',
    category: 'admin', kind: 'threshold', key: 'mentionLimit', defaultValue: 5, min: 1, max: 100
});

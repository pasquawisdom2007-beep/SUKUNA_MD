'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'warnconfig',
    description: 'Configure the group warning limit',
    category: 'admin', kind: 'threshold', key: 'warningLimit', defaultValue: 3, min: 1, max: 20
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'floodlimit',
    description: 'Configure the flood-protection threshold',
    category: 'admin', kind: 'threshold', key: 'floodLimit', defaultValue: 5, min: 1, max: 100
});

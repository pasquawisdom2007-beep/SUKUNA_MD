'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'domainage',
    description: 'Inspect a domain registration target',
    category: 'utility', kind: 'web'
});

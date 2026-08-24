'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'capslock',
    description: 'Configure all-caps message filtering',
    category: 'admin', kind: 'toggle'
});

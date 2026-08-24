'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'restrict',
    description: 'Configure restricted group mode',
    category: 'admin', kind: 'toggle'
});

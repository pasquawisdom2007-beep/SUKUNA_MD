'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'prompt',
    description: 'Improve a prompt for reliable model output',
    category: 'ai', kind: 'ai'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'sessionlist',
    description: 'Show current WhatsApp session status',
    category: 'owner', kind: 'owner'
});

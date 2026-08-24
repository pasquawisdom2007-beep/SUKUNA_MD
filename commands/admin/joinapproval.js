'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'joinapproval',
    description: 'Configure approval review for new members',
    category: 'admin', kind: 'toggle'
});

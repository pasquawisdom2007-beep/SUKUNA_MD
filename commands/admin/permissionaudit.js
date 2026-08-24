'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'permissionaudit',
    description: 'Audit current group permissions',
    category: 'admin', kind: 'permissionaudit'
});

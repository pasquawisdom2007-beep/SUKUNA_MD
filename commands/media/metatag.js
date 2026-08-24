'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'metatag',
    description: 'Read or edit quoted media metadata',
    category: 'media', kind: 'media'
});

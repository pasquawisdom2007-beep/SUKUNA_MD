'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'imagecaption',
    description: 'Create an accessible image caption from supplied text',
    category: 'ai', kind: 'ai'
});

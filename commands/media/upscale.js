'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'upscale',
    description: 'Enhance the resolution of a quoted image',
    category: 'media', kind: 'media'
});

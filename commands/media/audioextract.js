'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'audioextract',
    description: 'Extract audio from a quoted video',
    category: 'media', kind: 'media'
});

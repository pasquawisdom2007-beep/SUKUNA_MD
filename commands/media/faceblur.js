'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'faceblur',
    description: 'Blur faces in a quoted image',
    category: 'media', kind: 'media'
});

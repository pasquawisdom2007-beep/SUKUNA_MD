'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'exifremove',
    description: 'Remove location metadata from a quoted image',
    category: 'media', kind: 'media'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'colorize',
    description: 'Colorize a quoted image',
    category: 'media', kind: 'media'
});

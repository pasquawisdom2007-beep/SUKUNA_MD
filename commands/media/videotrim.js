'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'videotrim',
    description: 'Trim a section from quoted video',
    category: 'media', kind: 'media'
});

'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'translateaudio',
    description: 'Transcribe and translate quoted audio',
    category: 'media', kind: 'media'
});

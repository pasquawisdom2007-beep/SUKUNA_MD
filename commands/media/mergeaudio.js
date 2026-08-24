'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'mergeaudio',
    description: 'Join multiple audio files',
    category: 'media', kind: 'media'
});

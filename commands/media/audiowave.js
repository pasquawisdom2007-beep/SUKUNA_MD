'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'audiowave',
    description: 'Create a waveform image from quoted audio',
    category: 'media', kind: 'media'
});

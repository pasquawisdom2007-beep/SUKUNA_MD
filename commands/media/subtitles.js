'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'subtitles',
    description: 'Add or extract subtitles from media',
    category: 'media', kind: 'media'
});

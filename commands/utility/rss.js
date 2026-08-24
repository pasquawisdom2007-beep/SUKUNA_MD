'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'rss',
    description: 'Read the latest entries from a public RSS feed',
    category: 'utility', kind: 'web'
});

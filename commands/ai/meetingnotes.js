'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'meetingnotes',
    description: 'Turn a transcript into structured meeting notes',
    category: 'ai', kind: 'ai'
});

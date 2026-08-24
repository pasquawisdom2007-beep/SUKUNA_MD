'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'pdfchat',
    description: 'Ask questions about supplied PDF text',
    category: 'ai', kind: 'ai'
});

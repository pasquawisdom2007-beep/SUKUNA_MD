'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'pdfmerge',
    description: 'Merge selected PDF documents',
    category: 'utility', kind: 'media'
});

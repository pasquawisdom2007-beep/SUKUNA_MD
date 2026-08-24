'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'jsonschema',
    description: 'Generate JSON Schema from requirements or examples',
    category: 'ai', kind: 'ai'
});

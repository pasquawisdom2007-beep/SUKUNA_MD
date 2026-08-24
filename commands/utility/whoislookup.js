'use strict';

const { createRoadmapCommand } = require('../../utils/roadmapCommands');

module.exports = createRoadmapCommand({
    name: 'whoislookup',
    description: 'Open public WHOIS information for a domain',
    category: 'utility', kind: 'web'
});

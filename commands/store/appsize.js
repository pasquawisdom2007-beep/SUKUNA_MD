'use strict';
const { runAction } = require('../../utils/sukunaStore');
module.exports = {
    name: 'appsize',
    aliases: ['apprequirements', 'appreq'],
    description: 'Show Google Play app size and device requirements',
    category: 'store',
    async execute(context) { return runAction('size', context); },
};

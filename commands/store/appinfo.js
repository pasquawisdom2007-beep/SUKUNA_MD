'use strict';
const { runAction } = require('../../utils/sukunaStore');
module.exports = {
    name: 'appinfo',
    aliases: ['appdetails', 'appabout'],
    description: 'Show full Google Play app details',
    category: 'store',
    async execute(context) { return runAction('info', context); },
};

'use strict';
const { runAction } = require('../../utils/sukunaStore');
module.exports = {
    name: 'topapps',
    aliases: ['trendingapps', 'popularapps'],
    description: 'Show top free Google Play apps',
    category: 'store',
    async execute(context) { return runAction('top', context); },
};

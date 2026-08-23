'use strict';
const { runAction } = require('../../utils/sukunaStore');
module.exports = {
    name: 'appcollection',
    aliases: ['appcollections', 'myapps'],
    description: 'Manage saved Google Play app collections',
    category: 'store',
    async execute(context) { return runAction('collection', context); },
};

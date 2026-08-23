'use strict';
const { runAction } = require('../../utils/sukunaStore');
module.exports = {
    name: 'appcategory',
    aliases: ['appcategories', 'browseapps'],
    description: 'Browse Google Play apps by category',
    category: 'store',
    async execute(context) { return runAction('category', context); },
};

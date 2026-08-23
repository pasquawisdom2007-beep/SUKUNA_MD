'use strict';
const { runAction } = require('../../utils/sukunaStore');
module.exports = {
    name: 'playstore',
    aliases: ['appstore', 'apps', 'apphub'],
    description: 'Search Google Play apps from WhatsApp',
    category: 'store',
    async execute(context) { return runAction('search', context); },
};

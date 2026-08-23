'use strict';
const { runAction } = require('../../utils/sukunaStore');
module.exports = {
    name: 'appdownload',
    aliases: ['appdl', 'getapp'],
    description: 'Send an official Google Play app link',
    category: 'store',
    async execute(context) { return runAction('download', context); },
};

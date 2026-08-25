'use strict';

const groupRecap = require('../../utils/groupRecap');

module.exports = {
    name: 'grouprecap',
    aliases: ['recap', 'groupdigest'],
    description: 'Summarize recent group discussions with interactive views',
    usage: '.grouprecap [hours 1-72]',
    category: 'group',
    groupOnly: true,

    async execute(context) {
        return groupRecap.execute(context);
    },
};

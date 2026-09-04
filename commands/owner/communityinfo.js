'use strict';

const { executeCommunity } = require('../../utils/communityCommandFactory');

module.exports = {
    name: 'communityinfo',
    description: 'Show community metadata',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return executeCommunity({ ...context, name: 'communityinfo' });
    },
};

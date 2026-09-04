'use strict';

const { executeCommunity } = require('../../utils/communityCommandFactory');

module.exports = {
    name: 'communityadmin',
    description: 'Promote a community participant',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return executeCommunity({ ...context, name: 'communityadmin' });
    },
};

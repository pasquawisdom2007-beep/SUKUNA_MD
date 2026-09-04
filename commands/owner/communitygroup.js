'use strict';

const { executeCommunity } = require('../../utils/communityCommandFactory');

module.exports = {
    name: 'communitygroup',
    description: 'Create a group inside a community',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return executeCommunity({ ...context, name: 'communitygroup' });
    },
};

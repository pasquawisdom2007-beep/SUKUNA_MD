'use strict';

const { executeCommunity } = require('../../utils/communityCommandFactory');

module.exports = {
    name: 'addtocommunity',
    description: 'Add a participant to a community',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return executeCommunity({ ...context, name: 'addtocommunity' });
    },
};

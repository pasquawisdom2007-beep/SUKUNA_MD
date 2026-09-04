'use strict';

const { executeCommunity } = require('../../utils/communityCommandFactory');

module.exports = {
    name: 'leavecommunity',
    description: 'Leave a WhatsApp community',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return executeCommunity({ ...context, name: 'leavecommunity' });
    },
};

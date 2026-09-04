'use strict';

const privacy = require('./privacy');

module.exports = {
    name: 'readreceipts',
    description: 'Read receipts',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return privacy.execute({ ...context, args: ['readreceipts', ...context.args] });
    },
};

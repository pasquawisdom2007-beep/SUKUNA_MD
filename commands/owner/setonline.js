'use strict';

const privacy = require('./privacy');

module.exports = {
    name: 'setonline',
    description: 'Online privacy',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return privacy.execute({ ...context, args: ['${name}', ...context.args] });
    },
};

'use strict';

const privacy = require('./privacy');

module.exports = {
    name: 'disappearing',
    description: 'Default disappearing messages',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return privacy.execute({ ...context, args: ['disappearing', ...context.args] });
    },
};

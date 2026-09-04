'use strict';

const privacy = require('./privacy');

module.exports = {
    name: 'pfpprivacy',
    description: 'Profile-photo privacy',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return privacy.execute({ ...context, args: ['${name}', ...context.args] });
    },
};

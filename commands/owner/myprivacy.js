'use strict';

const privacy = require('./privacy');

module.exports = {
    name: 'myprivacy',
    description: 'View privacy settings',
    category: 'owner',
    ownerOnly: true,
    async execute(context) {
        return privacy.execute({ ...context, args: ['myprivacy'] });
    },
};

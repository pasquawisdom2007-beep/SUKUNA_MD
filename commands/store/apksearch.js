'use strict';
const { runAction } = require('../../utils/fdroidStore');
module.exports = {
    name: 'apksearch',
    aliases: ['fdroidsearch', 'searchapk'],
    description: 'Search the official F-Droid repository for APKs',
    category: 'store',
    async execute(context) { return runAction('search', context); },
};

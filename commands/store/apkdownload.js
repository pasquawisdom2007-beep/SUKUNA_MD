'use strict';
const { runAction } = require('../../utils/fdroidStore');
module.exports = {
    name: 'apkdownload',
    aliases: ['fdroid', 'fdroidapk', 'downloadapk', 'getapk'],
    description: 'Download and send an official F-Droid APK',
    category: 'store',
    async execute(context) { return runAction('download', context); },
};

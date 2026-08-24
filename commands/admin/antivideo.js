'use strict';

const { createAntiMediaCommand } = require('../../utils/antiMediaCommand');

module.exports = createAntiMediaCommand({
    name: 'antivideo',
    property: 'antivideo',
    label: 'VIDEO',
    mediaLabel: 'Video',
});

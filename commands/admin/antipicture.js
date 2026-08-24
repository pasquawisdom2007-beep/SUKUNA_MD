'use strict';

const { createAntiMediaCommand } = require('../../utils/antiMediaCommand');

module.exports = createAntiMediaCommand({
    name: 'antipicture',
    property: 'antipicture',
    label: 'PICTURE',
    mediaLabel: 'Picture',
});

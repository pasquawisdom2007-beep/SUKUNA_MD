'use strict';

const sharp = require('sharp');

async function webp2png(input) {
    return sharp(input).png().toBuffer();
}

module.exports = { webp2png };

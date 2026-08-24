'use strict';

const messageIndex = require('../../utils/messageIndex');

module.exports = {
    name: 'messageindex',
    aliases: ['msgindex'],
    description: 'Show the live message-index cache status',
    category: 'utility',
    async execute({ reply, phoneNumber }) {
        const count = messageIndex.get(phoneNumber, '__count__') ? 1 : 0;
        return reply(`🧾 *Message index*\n\nLive cache is active.\nRetention: *6 hours*\n\nThis in-memory index supports message inspection features and never exposes message contents.`);
    },
    add: messageIndex.add,
    get: messageIndex.get,
};

'use strict';

const summary = require('./chatsummary');

module.exports = {
    name: 'atmosphere',
    aliases: ['chatmood', 'mood'],
    description: 'Describe the current atmosphere of the recent chat',
    usage: '.atmosphere',
    category: 'ai',
    async execute(context) {
        return summary.execute({ ...context, args: ['atmosphere'] });
    },
};

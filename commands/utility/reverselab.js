'use strict';

/**
 * .reverselab — raw WhatsApp message-structure experiment.
 *
 * Use by replying to any message with `.reverselab`. The command logs the
 * complete command message object to the bot terminal; the reply also reports
 * the quoted message keys when WhatsApp supplied them.
 */
module.exports = {
    name: 'reverselab',
    aliases: ['messagelab', 'rawmessage'],
    description: 'Inspect and log the raw WhatsApp message structure for testing',
    usage: '.reverselab (reply to a message)',
    category: 'utility',

    async execute({ msg, reply }) {
        try {
            const message = msg || {};
            const key = message.key || {};
            const messageKeys = Object.keys(message.message || {});
            const quoted = message.quoted || null;
            const quotedKeys = Object.keys(quoted?.message || {});

            console.log('\n========== MESSAGE LAB / REVERSE LAB ==========');
            console.log('REMOTE JID :', key.remoteJid || 'none');
            console.log('MESSAGE ID :', key.id || 'none');
            console.log('FROM ME    :', Boolean(key.fromMe));
            console.log('PARTICIPANT:', key.participant || 'none');
            console.log('TRIGGER TYPE:', messageKeys[0] || 'unknown');
            console.log('QUOTED TYPE :', quotedKeys[0] || 'none');
            console.dir(message, { depth: 8, colors: false });
            console.log('========== END MESSAGE LAB ====================\n');

            return reply(
                `🧬 *MESSAGE LAB*\n\n` +
                `Message ID:\n${key.id || 'unknown'}\n\n` +
                `Remote JID:\n${key.remoteJid || 'unknown'}\n\n` +
                `From Me:\n${Boolean(key.fromMe)}\n\n` +
                `Participant:\n${key.participant || 'none'}\n\n` +
                `Trigger Type:\n${messageKeys[0] || 'unknown'}\n\n` +
                `Quoted Type:\n${quotedKeys[0] || 'none'}\n\n` +
                `Trigger message keys:\n${messageKeys.join(', ') || 'none'}\n\n` +
                `Quoted message keys:\n${quotedKeys.join(', ') || 'none'}\n\n` +
                `_Full raw structure printed in the bot terminal._\n` +
                `_This is a testing command; no message reconstruction is performed yet._`
            );
        } catch (error) {
            console.error('MESSAGE LAB ERROR:', error);
            return reply(`❌ Message Lab failed:\n${error.message}`);
        }
    },
};

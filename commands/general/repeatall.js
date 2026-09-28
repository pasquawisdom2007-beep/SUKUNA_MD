'use strict';

/**
 * .repeatall — visible group-wide repeat.
 *
 * Unlike hidetag, every recipient is shown in the message text. This command
 * intentionally requires no admin role, but keeps conservative repeat limits
 * to reduce accidental notification spam.
 */
module.exports = {
    name: 'repeatall',
    aliases: ['repeat-all'],
    description: 'Repeat a visible announcement to everyone in the group',
    usage: '.repeatall <1-10> <message>',
    category: 'general',

    async execute({ args, sock, from, msg, reply, isGroup }) {
        if (!isGroup) return reply('👥 `.repeatall` can only be used in a group.');

        const count = Number.parseInt(args[0], 10);
        if (!Number.isInteger(count) || count < 1 || count > 10) {
            return reply('Usage: `.repeatall <1-10> <message>`\nExample: `.repeatall 2 Meeting starts now`');
        }

        const text = args.slice(1).join(' ').trim();
        if (!text) return reply('Give me a message to repeat.');
        if (text.length > 1000) return reply('The announcement must be 1000 characters or fewer.');

        try {
            const metadata = await sock.groupMetadata(from);
            const participants = (metadata.participants || [])
                .map(participant => participant.id || participant.jid)
                .filter(jid => typeof jid === 'string' && jid.includes('@'));

            if (!participants.length) return reply('❌ I could not load the group members.');

            const visibleRoster = participants
                .map(jid => `@${jid.split('@')[0].split(':')[0]}`)
                .join(' ');
            const message =
                `📣 *FOR EVERYONE IN ${metadata.subject || 'THIS GROUP'}*\n\n` +
                `${text}\n\n` +
                `👥 *Members notified:*\n${visibleRoster}`;

            for (let index = 0; index < count; index += 1) {
                await sock.sendMessage(from, {
                    text: message,
                    mentions: participants,
                }, { quoted: msg });
                if (index + 1 < count) await new Promise(resolve => setTimeout(resolve, 250));
            }
        } catch (error) {
            console.error('[repeatall]', error);
            return reply(`❌ Repeatall failed: ${error.message}`);
        }
    },
};

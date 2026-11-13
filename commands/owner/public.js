/**
 * Public Command — Open bot to everyone
 * Usage: .public [here]
 */

module.exports = {
    name: 'public',
    aliases: ['everyone', 'unlock'],
    description: 'Set bot to public mode globally or only in the current chat',
    usage: '.public [here]',
    category: 'owner',

    async execute({ reply, database, phoneNumber, from, args = [] }) {
        if (!phoneNumber) {
            return reply('⚠️ Session not ready — phone number missing. Try again in a moment.');
        }

        if (String(args[0] || '').toLowerCase() === 'here') {
            if (!database.getPrivateChat(phoneNumber, from)) return reply('🌍 This chat is already *PUBLIC*.');
            database.setPrivateChat(phoneNumber, from, false);
            return reply('🌍 *THIS CHAT IS PUBLIC AGAIN*\n_The bot’s global mode was not changed._');
        }

        if (!database.getSelfMode(phoneNumber)) {
            return reply(`🌍 Already *PUBLIC*. Use *.private* to lock.`);
        }

        database.setSelfMode(phoneNumber, false);
        reply(`🌍 *PUBLIC MODE ON* — everyone can use commands.\n_Use *.private* to lock._`);
    }
};

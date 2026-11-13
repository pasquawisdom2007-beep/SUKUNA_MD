/**
 * Private Command — Lock bot to paired number only
 * Usage: .private [here]
 */

module.exports = {
    name: 'private',
    aliases: ['selfmode', 'lock'],
    description: 'Set bot to private mode globally or only in the current chat',
    usage: '.private [here]',
    category: 'owner',

    async execute({ reply, database, phoneNumber, from, args = [] }) {
        if (!phoneNumber) {
            return reply('⚠️ Session not ready — phone number missing. Try again in a moment.');
        }

        if (String(args[0] || '').toLowerCase() === 'here') {
            if (database.getPrivateChat(phoneNumber, from)) return reply('🔒 This chat is already *PRIVATE*. Use *.public here* to reopen it.');
            database.setPrivateChat(phoneNumber, from, true);
            return reply('🔒 *PRIVATE MODE ON FOR THIS CHAT*\n_The bot remains public everywhere else. Use *.public here* to reopen._');
        }

        if (database.getSelfMode(phoneNumber)) {
            return reply(`🔒 Already *PRIVATE*. Use *.public* to open.`);
        }

        // Flip the mode. setSelfMode already persists to disk —
        // do NOT also overwrite ownerNumber here: getOwnerNumber()
        // falls back to phoneNumber by default, and overwriting it
        // clobbers any legitimate owner already stored (which then
        // breaks .public for the real owner).
        database.setSelfMode(phoneNumber, true);

        reply(`🔒 *PRIVATE MODE ON* — owner only.\n_Use *.public* to reopen._`);
    }
};

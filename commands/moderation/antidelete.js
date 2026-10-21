/**
 * Anti-Delete — privately recovers deleted messages (SUKUNA MD)
 *
 *   .antidelete                 → status + destination + usage
 *   .antidelete on [dm|chat]    → enable (default: dm = the bot owner's DM)
 *   .antidelete off             → disable
 *
 * Only the bot owner and sudo users can use this command.
 */
'use strict';

const database = require('../../utils/database');
const { getMode, setMode } = require('../../utils/antiDeleteMode');

const digits = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const FOOTER = `> _𝘚𝘶𝘬𝘶𝘯𝘢 𝘔𝘋 · 𝘒𝘪𝘯𝘨 𝘰𝘧 𝘊𝘶𝘳𝘴𝘦𝘴_`;
const where = (mode) => (mode === 'chat' ? 'the chat where it was deleted' : "the bot owner's DM");

module.exports = {
    name:        'antidelete',
    aliases:     ['antidel', 'ad', 'antirevoke'],
    category:    'moderation',
    description: 'Toggle anti-delete and choose where recovered messages are sent',
    usage:       '.antidelete on [dm|chat] | off',

    async execute({ args = [], sender, isOwner, isSessionOwner, isSudo, phoneNumber, prefix = '.', reply }) {
        // ── Access: bot owner (paired account) or sudo users only ──
        const owner = (isSessionOwner !== undefined ? isSessionOwner : isOwner) === true;
        let sudo = isSudo === true;
        if (!sudo && isSudo === undefined) {
            try {
                const list = (database.getSudoUsers(phoneNumber) || []).map(digits);
                sudo = !!digits(sender) && list.includes(digits(sender));
            } catch (_) { sudo = false; }
        }
        if (!owner && !sudo) {
            return reply(`❌ _Only the bot owner and sudo users can use this command._`);
        }

        const action = String(args[0] || '').toLowerCase();
        const mode   = String(args[1] || '').toLowerCase();
        const usage  = `*Usage:*\n• \`${prefix}antidelete on [dm|chat]\`\n• \`${prefix}antidelete off\``;
        const enabled = !!database.getAntiDeleteGlobal(phoneNumber);

        // ── no option → status ──
        if (!action) {
            return reply(
                `🛡️ *𝗔𝗡𝗧𝗜-𝗗𝗘𝗟𝗘𝗧𝗘* ⛧\n\n` +
                `*Status:* ${enabled ? '🟢 ON' : '🔴 OFF'}\n` +
                `*Destination:* ${where(getMode(phoneNumber))}\n` +
                `*Scope:* groups and private chats\n\n` +
                `${usage}\n\n` +
                `_𝘖𝘯𝘭𝘺 𝘵𝘩𝘦 𝘣𝘰𝘵 𝘰𝘸𝘯𝘦𝘳 𝘢𝘯𝘥 𝘴𝘶𝘥𝘰𝘴 𝘤𝘢𝘯 𝘶𝘴𝘦 𝘵𝘩𝘪𝘴 𝘤𝘰𝘮𝘮𝘢𝘯𝘥._\n\n` +
                FOOTER
            );
        }

        // ── off ──
        if (action === 'off' && !mode) {
            database.setAntiDeleteGlobal(phoneNumber, false);
            database.setAntiDeletePersonal(phoneNumber, false);
            // really stop everything: also clear any old per-group switch
            try {
                for (const id of Object.keys(database.data?.groups || {})) {
                    if (database.data.groups[id]?.antidelete) database.setGroup(id, 'antidelete', false);
                }
            } catch (_) { /* best effort */ }
            return reply(
                `🛡️ *𝗔𝗡𝗧𝗜-𝗗𝗘𝗟𝗘𝗧𝗘 𝗜𝗦 𝗢𝗙𝗙* ⛧\n\n` +
                `🔴 Deleted messages will no longer be recovered.\n\n` +
                FOOTER
            );
        }

        // ── anything that is not "on [dm|chat]" ──
        if (action !== 'on' || (mode && !['dm', 'chat'].includes(mode))) {
            return reply(`❌ _Invalid option._\n\n${usage}`);
        }

        // ── on [dm|chat] ──
        const dest = mode || 'dm';
        database.setAntiDeleteGlobal(phoneNumber, true);      // groups (account-wide)
        database.setAntiDeletePersonal(phoneNumber, true);    // private chats
        setMode(phoneNumber, dest);                           // saved to disk
        return reply(
            `🛡️ *𝗔𝗡𝗧𝗜-𝗗𝗘𝗟𝗘𝗧𝗘 𝗜𝗦 𝗢𝗡* ⛧\n\n` +
            `✅ Deleted messages from groups and private chats will be sent to *${where(dest)}*.\n` +
            (dest === 'chat' ? `_𝘕𝘰𝘵𝘦: 𝘦𝘷𝘦𝘳𝘺𝘰𝘯𝘦 𝘪𝘯 𝘵𝘩𝘢𝘵 𝘤𝘩𝘢𝘵 𝘸𝘪𝘭𝘭 𝘴𝘦𝘦 𝘵𝘩𝘦 𝘳𝘦𝘤𝘰𝘷𝘦𝘳𝘦𝘥 𝘮𝘦𝘴𝘴𝘢𝘨𝘦._\n` : '') +
            `\n${FOOTER}`
        );
    },
};

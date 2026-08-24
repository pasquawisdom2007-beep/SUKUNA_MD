'use strict';

const { prefixOf } = require('./commandHelpers');
const database = require('./database');

async function resolveBotAdmin(sock, groupId, provided) {
    if (typeof provided === 'boolean') return provided;
    try {
        const meta = await sock?.groupMetadata?.(groupId);
        const botNumber = String(sock?.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '');
        return !!meta?.participants?.some(participant => {
            const identifiers = [participant.id, participant.jid, participant.phoneNumber, participant.lid]
                .filter(Boolean)
                .map(value => String(value));
            return identifiers.some(id => {
                const number = id.split('@')[0].split(':')[0].replace(/\D/g, '');
                return number && number === botNumber;
            }) && !!participant.admin;
        });
    } catch (_) {
        return false;
    }
}

function createAntiMediaCommand({ name, property, label, mediaLabel }) {
    return {
        name,
        aliases: [`no${name.replace('anti', '')}`],
        description: `Delete ${mediaLabel} messages from groups`,
        category: 'admin',
        usage: `.${name} on|off|status`,

        async execute({ sock, reply, args, from, isGroup, isAdmin, isBotAdmin, prefix }) {
            const px = prefixOf(prefix);
            const botAdmin = await resolveBotAdmin(sock, from, isBotAdmin);
            if (!isGroup) return reply('👥 This command can only be used in groups.');
            if (!isAdmin) return reply('🛡️ *Admin Only!*\n\nOnly group admins can configure this protection.');

            const action = String(args?.[0] || 'status').toLowerCase();
            const group = database.getGroup(from);
            if (!['on', 'off', 'status'].includes(action)) {
                return reply(
                    `🛡️ *Anti-${label}*\n\n` +
                    `Status: ${group[property] ? '✅ ON' : '❌ OFF'}\n` +
                    `Usage: ${px}${name} on|off|status\n\n` +
                    `When enabled, matching messages are deleted silently when I am a group admin.`
                );
            }
            if (action === 'status') {
                return reply(
                    `🛡️ *Anti-${label} Status*\n\n` +
                    `Status: ${group[property] ? '✅ ON' : '❌ OFF'}\n` +
                    `Action: Delete ${mediaLabel.toLowerCase()} messages\n` +
                    `Bot admin: ${botAdmin ? '✅ Yes' : '❌ No/unknown'}`
                );
            }
            if (action === 'on' && !botAdmin) {
                return reply('❌ I must be a group admin before I can delete media messages.');
            }
            database.setGroup(from, property, action === 'on');
            return reply(action === 'on'
                ? `✅ *Anti-${label} enabled.* Matching ${mediaLabel.toLowerCase()} messages will be deleted.`
                : `❌ *Anti-${label} disabled.*`);
        },
    };
}

module.exports = { createAntiMediaCommand };

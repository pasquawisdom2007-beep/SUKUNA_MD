'use strict';

const database = require('../../utils/database');
const {
    getLinkAllowList,
    uniqueIdentities,
    participantIdentityList,
    resolveParticipant,
    displayIdentity,
} = require('../../utils/antilinkAllow');
const { sameIdentity } = require('../../utils/antiBotSignals');

function contextInfo(msg) {
    const message = msg?.message || msg || {};
    return message?.extendedTextMessage?.contextInfo
        || message?.imageMessage?.contextInfo
        || message?.videoMessage?.contextInfo
        || message?.documentMessage?.contextInfo
        || message?.buttonsResponseMessage?.contextInfo
        || message?.listResponseMessage?.contextInfo
        || null;
}

function targetFromMessage(msg, args, offset = 0) {
    const ctx = contextInfo(msg);
    const mentioned = ctx?.mentionedJid?.[0];
    if (mentioned) return { value: mentioned, source: 'mention' };
    if (ctx?.participant) return { value: ctx.participant, source: 'reply' };
    const raw = args?.[offset];
    if (raw) return { value: raw, source: 'number' };
    return null;
}

async function resolveTargetJids(sock, from, target) {
    if (!target?.value) return [];
    const raw = String(target.value).trim();
    const meta = await sock.groupMetadata(from).catch(() => null);

    if (meta) {
        const participant = resolveParticipant(meta, raw) ||
            (raw.includes('@') ? null : meta.participants?.find(item =>
                participantIdentityList(item).some(candidate => sameIdentity(candidate, raw))
            ));
        if (participant) return participantIdentityList(participant);
    }

    const number = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (number.length >= 7) return [`${number}@s.whatsapp.net`];
    return raw.includes('@') ? [raw] : [];
}

function usage(reply) {
    return reply(
        '🔗 *Link Allowlist*\n\n' +
        'Allow a non-admin to post links while antilink is enabled.\n\n' +
        '*Usage:*\n' +
        '• Reply to a user and type `.linkallow`\n' +
        '• Tag a user: `.linkallow @user`\n' +
        '• Remove: `.linkallow remove @user`\n' +
        '• View allowed users: `.linkallow list`\n' +
        '• Clear all: `.linkallow clear`'
    );
}

module.exports = {
    name: 'linkallow',
    aliases: ['allowlink', 'linkwhitelist'],
    description: 'Allow a tagged member to post links without antilink enforcement',
    category: 'admin',
    async execute({ sock, reply, args, from, isGroup, isAdmin, msg }) {
        if (!isGroup) return reply('👥 This command can only be used in groups.');
        if (!isAdmin) return reply('🛡️ *Admin Only!*\n\nOnly group admins can manage the link allowlist.');

        const action = String(args?.[0] || '').toLowerCase();
        const group = database.getGroup(from);
        const allowList = getLinkAllowList(group);

        if (!action || ['help', '-h', '--help'].includes(action)) return usage(reply);

        if (['list', 'status', 'show'].includes(action)) {
            if (!allowList.length) return reply('🔗 *Link Allowlist*\n\nNo members are currently exempt from antilink.');
            const lines = uniqueIdentities(allowList).map(jid => `• @${displayIdentity(jid)}`).join('\n');
            const mentions = uniqueIdentities(allowList);
            return reply(`🔗 *Link Allowlist*\n\n${lines}\n\nThese members may post links while antilink is enabled.`, { mentions });
        }

        if (['clear', 'reset'].includes(action)) {
            if (!allowList.length) return reply('🔗 The link allowlist is already empty.');
            database.setGroup(from, 'antilinkAllow', []);
            return reply('✅ *Link Allowlist Cleared*\n\nAll member exemptions have been removed.');
        }

        const removing = ['remove', 'del', 'delete', 'off', 'deny'].includes(action);
        const target = targetFromMessage(msg, args, removing ? 1 : 0);
        const targetJids = await resolveTargetJids(sock, from, target);
        if (!targetJids.length) return usage(reply);

        if (removing) {
            const remaining = allowList.filter(existing =>
                !targetJids.some(targetJid => sameIdentity(existing, targetJid))
            );
            if (remaining.length === allowList.length) {
                return reply(`ℹ️ @${displayIdentity(targetJids[0])} is not on the link allowlist.`, { mentions: targetJids });
            }
            database.setGroup(from, 'antilinkAllow', uniqueIdentities(remaining));
            return reply(`✅ @${displayIdentity(targetJids[0])} can no longer bypass antilink.`, { mentions: targetJids });
        }

        const next = uniqueIdentities([...allowList, ...targetJids]);
        if (next.length === allowList.length) {
            return reply(`ℹ️ @${displayIdentity(targetJids[0])} is already allowed to post links.`, { mentions: targetJids });
        }
        database.setGroup(from, 'antilinkAllow', next);
        return reply(
            `✅ @${displayIdentity(targetJids[0])} is now allowed to post links.\n\n` +
            'Antilink will ignore this member while protection remains enabled.',
            { mentions: targetJids }
        );
    },
};

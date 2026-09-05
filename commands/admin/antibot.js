'use strict';

const database = require('../../utils/database');
const {
    detectBotSignals,
    participantIdentifiers,
    sameIdentity,
    shortJid,
} = require('../../utils/antiBotSignals');
const { challengeGroupMembers } = require('../../utils/antiBotEngine');

function botJids(sock) {
    return [sock.user?.id, sock.user?.lid, sock.user?.jid, sock.user?.phoneNumber].filter(Boolean);
}

function isSelf(sock, jid) {
    return botJids(sock).some(identity => sameIdentity(identity, jid));
}

function actionLabel(config) {
    return String(config.antibotAction || (config.antibotMode === 'warn' ? 'warn' : 'kick')).toLowerCase();
}

module.exports = {
    name: 'antibot',
    aliases: ['nobot', 'antibots'],
    description: 'Detect and control automated bot accounts and bot messages in groups',
    category: 'admin',

    async execute({ sock, reply, args, from, isGroup, isAdmin }) {
        if (!isGroup) return reply('👥 This command can only be used in groups.');
        if (!isAdmin) return reply('🛡️ *Admin only.* You must be a group admin to configure AntiBot.');

        const action = String(args[0] || '').toLowerCase();
        const group = database.getGroup(from);
        const currentAction = actionLabel(group);
        const maxWarnings = Math.max(1, Number(group.antibotMaxWarnings) || 3);

        if (!action || !['on', 'off', 'delete', 'kick', 'warn', 'status', 'scan'].includes(action)) {
            return reply(
                '🤖 *AntiBot configuration*\n\n' +
                `Status: ${group.antibot ? '✅ ACTIVE' : '❌ INACTIVE'}\n` +
                `Action: *${currentAction.toUpperCase()}*\n` +
                `Warning limit: *${maxWarnings}*\n\n` +
                '*Usage:*\n' +
                '• `.antibot delete` — delete detected bot messages\n' +
                '• `.antibot kick` — delete and remove detected bots\n' +
                '• `.antibot warn 3` — delete, warn, then remove at the limit\n' +
                '• `.antibot on` — enable the current action\n' +
                '• `.antibot scan` — scan current members\n' +
                '• `.antibot status` — show current settings\n' +
                '• `.antibot off` — disable AntiBot\n\n' +
                '_Admins and the bot itself are always exempt._'
            );
        }

        if (action === 'status') {
            return reply(
                '🤖 *AntiBot status*\n\n' +
                `Active: ${group.antibot ? '✅ Yes' : '❌ No'}\n` +
                `Action: *${currentAction.toUpperCase()}*\n` +
                `Warning limit: *${maxWarnings}*\n\n` +
                '_Detection combines explicit bot metadata, known library message-ID signatures, and sender-bound verification for bots that expose no metadata._'
            );
        }

        if (action === 'off') {
            database.setGroup(from, 'antibot', false);
            return reply('❌ *AntiBot disabled for this group.*');
        }

        if (['on', 'delete', 'kick', 'warn'].includes(action)) {
            let selected = action === 'on' ? currentAction : action;
            let selectedMax = maxWarnings;
            if (action === 'warn' && args[1] !== undefined) {
                selectedMax = Number.parseInt(args[1], 10);
                if (!Number.isInteger(selectedMax) || selectedMax < 1 || selectedMax > 20) {
                    return reply('Use a warning limit from 1 to 20, for example: `.antibot warn 3`');
                }
            }
            database.setGroup(from, 'antibot', true);
            database.setGroup(from, 'antibotAction', selected);
            database.setGroup(from, 'antibotMode', selected === 'warn' ? 'warn' : 'kick');
            if (selected === 'warn') database.setGroup(from, 'antibotMaxWarnings', selectedMax);
            return reply(
                '✅ *AntiBot enabled*\n\n' +
                `Action: *${selected.toUpperCase()}*` +
                (selected === 'warn' ? `\nWarning limit: *${selectedMax}*` : '') +
                '\n\n_Detected bot messages are handled immediately; group admins and this bot are excluded._'
            );
        }

        if (action === 'scan') {
            await reply('🔍 *Scanning current group members for high-confidence bot signatures...*');
            try {
                const meta = await sock.groupMetadata(from);
                const botIsAdmin = meta.participants.some(p =>
                    participantIdentifiers(p).some(id => isSelf(sock, id)) && Boolean(p.admin)
                );
                const detected = meta.participants.filter(participant => {
                    const jid = participantIdentifiers(participant)[0];
                    if (!jid || isSelf(sock, jid) || participant.admin) return false;
                    return detectBotSignals({ jid, participant }).highConfidence;
                });

                if (!detected.length) {
                    let verification = '';
                    try {
                        const result = await challengeGroupMembers(sock, from);
                        verification = `\n\n🛡️ Sender-bound verification started for *${result.issued}* non-admin member(s).`;
                    } catch (_) {}
                    return reply(`✅ No high-confidence bot signatures found among ${meta.participants.length} members.${verification}`);
                }

                const list = detected.map(participant => {
                    const jid = participantIdentifiers(participant)[0];
                    const signal = detectBotSignals({ jid, participant });
                    return `• @${shortJid(jid)} — ${signal.reason || 'bot signature'}`;
                }).join('\n');

                if (!botIsAdmin && currentAction !== 'delete') {
                    return reply(`🤖 *${detected.length} likely bot account(s) found:*\n\n${list}\n\n❌ Promote me to group admin before using kick enforcement.`);
                }

                if (currentAction === 'delete') {
                    return reply(`🤖 *${detected.length} bot account(s) matched:*\n\n${list}\n\n_Delete mode applies to messages; use .antibot kick to remove existing members._`);
                }

                let removed = 0;
                for (const participant of detected) {
                    const jid = participantIdentifiers(participant)[0];
                    try {
                        await sock.groupParticipantsUpdate(from, [jid], 'remove');
                        database.resetWarnings(from, jid);
                        removed++;
                    } catch (_) {}
                }
                return reply(`✅ Removed *${removed}/${detected.length}* detected bot account(s).`);
            } catch (error) {
                return reply(`❌ AntiBot scan failed: ${error.message}`);
            }
        }
    },
};

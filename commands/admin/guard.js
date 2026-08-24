'use strict';

const database = require('../../utils/database');
const { prefixOf } = require('../../utils/commandHelpers');

const DEFAULT_QUESTION = 'Are you human?';
const DEFAULT_OPTIONS = ['I am human', 'I am a robot'];

function parseConfiguration(args) {
    const parts = args.slice(1).join(' ').split('|').map(value => value.trim());
    if (parts.length !== 4 || parts.some(value => !value)) return null;
    const [question, first, second, correctValue] = parts;
    if (question.length > 180 || first.length > 60 || second.length > 60 || first === second) return null;
    const correctNumber = Number(correctValue);
    if (![1, 2].includes(correctNumber)) return null;
    return { question, options: [first, second], correct: correctNumber - 1 };
}

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

function usage(prefix) {
    return (
        `🛡️ *Guard Verification*\n\n` +
        `Usage:\n` +
        `• ${prefix}guard on\n` +
        `• ${prefix}guard off\n` +
        `• ${prefix}guard status\n` +
        `• ${prefix}guard set <question> | <option 1> | <option 2> | <correct 1-2>\n` +
        `• ${prefix}guard reset\n\n` +
        `New members receive one two-option poll and have 2 minutes to answer. ` +
        `Incorrect or expired verification results in removal when I am a group admin.`
    );
}

module.exports = {
    name: 'guard',
    description: 'Verify new group members with a two-minute poll challenge',
    category: 'admin',
    usage: '.guard on|off|status|set|reset',

    async execute({ sock, reply, args, from, isGroup, isAdmin, isBotAdmin, prefix }) {
        const px = prefixOf(prefix);
        const botAdmin = await resolveBotAdmin(sock, from, isBotAdmin);
        if (!isGroup) return reply('👥 This command can only be used in groups.');
        if (!isAdmin) return reply('🛡️ *Admin Only!*\n\nOnly group admins can configure Guard.');

        const action = String(args?.[0] || 'status').toLowerCase();
        const group = database.getGroup(from);
        if (!['on', 'off', 'status', 'set', 'reset'].includes(action)) return reply(usage(px));

        if (action === 'status') {
            const options = Array.isArray(group.guardOptions) ? group.guardOptions : DEFAULT_OPTIONS;
            return reply(
                `🛡️ *Guard Status*\n\n` +
                `Status: ${group.guard ? '✅ ON' : '❌ OFF'}\n` +
                `Bot admin: ${botAdmin ? '✅ Yes' : '❌ No/unknown'}\n` +
                `Question: ${group.guardQuestion || DEFAULT_QUESTION}\n` +
                `Options: 1) ${options[0]}  2) ${options[1]}\n` +
                `Correct option: ${Number(group.guardCorrect) === 1 ? 2 : 1}\n` +
                `Time limit: 2 minutes`
            );
        }

        if (action === 'set') {
            const configuration = parseConfiguration(args || []);
            if (!configuration) {
                return reply(
                    `❌ Invalid Guard configuration.\n\n` +
                    `Use:\n${px}guard set <question> | <option 1> | <option 2> | <correct 1-2>\n\n` +
                    `Example:\n${px}guard set Select the human answer | Human | Robot | 1`
                );
            }
            database.setGroup(from, 'guardQuestion', configuration.question);
            database.setGroup(from, 'guardOptions', configuration.options);
            database.setGroup(from, 'guardCorrect', configuration.correct);
            return reply(`✅ Guard question saved. Correct option: ${configuration.correct + 1}. Use ${px}guard on to enable it.`);
        }

        if (action === 'reset') {
            database.setGroup(from, 'guardQuestion', DEFAULT_QUESTION);
            database.setGroup(from, 'guardOptions', DEFAULT_OPTIONS);
            database.setGroup(from, 'guardCorrect', 0);
            return reply(`✅ Guard challenge reset to the default question and options.`);
        }

        if (action === 'on') {
            if (!botAdmin) return reply('❌ I must be a group admin before Guard can verify or remove newcomers.');
            database.setGroup(from, 'guard', true);
            return reply(`✅ *Guard enabled.* New members will receive a two-option verification poll and have 2 minutes to answer.`);
        }

        database.setGroup(from, 'guard', false);
        return reply('❌ *Guard disabled.* New members will no longer receive verification polls.');
    },
};

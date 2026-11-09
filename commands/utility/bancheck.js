'use strict';

const { checkWithBaron, getAppealStatus, classifyBan, formatUtc, formatElapsed, normalizeNumber } = require('./banchecker');
const { sendSukunaBanCanvas } = require('../../utils/genaiRich');

module.exports = {
    name: 'bancheck',
    aliases: [],
    description: 'Check WhatsApp ban status with a biometric canvas report',
    usage: '.bancheck <number>',
    category: 'utility',

    async execute({ sock, msg, from, reply, args, isOwner }) {
        if (!isOwner) return reply('❌ *Owner only!*');

        const target = normalizeNumber(args.join(' ').trim());
        if (!target) {
            return reply(
                `🛡️ *TEXT BAN CHECKER*\n\n` +
                `Usage: *.bancheck <number>*\n` +
                `Example: *.bancheck +234 912 781 4853*\n\n` +
                `Use the full country code. Spaces, +, and dashes are accepted.`
            );
        }

        try {
            const baron = await checkWithBaron(target);
            if (!baron) return reply('❌ Ban checker API key is not configured. Set BANCHECK_API_KEY or BARON_API_KEY in the deployment environment.');
            const isBanned = baron.banned === true;
            let appeal = null;
            if (isBanned) { try { appeal = await getAppealStatus(target); } catch (error) { console.warn('[bancheck] Appeal status unavailable:', error.message); } }
            const reviewAvailable = isBanned && baron.in_app_ban_appeal === true;
            return sendSukunaBanCanvas({
                sock, jid: from, quoted: msg, number: target, banned: isBanned, reviewAvailable,
                details: {
                    banKind: classifyBan(baron, appeal), banType: appeal?.ban_type || baron.ban_type,
                    banTime: formatUtc(appeal?.ban_time || baron.ban_time), banAge: formatElapsed(appeal?.ban_time || baron.ban_time),
                    appealStatus: appeal?.status, reviewTime: formatUtc(appeal?.appeal_creation_time),
                    reason: appeal?.reason || baron.violation_reason || baron.violation_label,
                    category: baron.violation_category, isEu: typeof baron.is_eu === 'boolean' ? baron.is_eu : null,
                },
            });
        } catch (error) {
            console.error('[bancheck] Baron API failed:', error.message);
            return reply(`❌ Baron ban check failed: ${error.message}\nTry again or verify the API key.`);
        }
    },
};

/**
 * AntiBot Command — Admin Only
 *
 * Detection methods (layered):
 *  1. JOIN event: every non-admin newcomer receives Guard verification
 *  2. MESSAGE: explicit bot metadata or known bot-library message-ID stamp
 *  3. JOIN/SCAN: linked-device JIDs are weak candidates only, never an
 *     automatic kick by themselves because legitimate companion devices use them
 *  4. SCAN: checks current members for high-confidence signatures
 *
 * Usage:
 *   .antibot on     — enable verification and high-confidence enforcement
 *   .antibot kick   — enable verification and remove confirmed bot signatures
 *   .antibot warn   — enable, warn only (no kick)
 *   .antibot off    — disable
 *   .antibot status — show current settings
 *   .antibot scan   — scan group for suspected bots now
 */

const database = require('../../utils/database');
const {
    detectBotSignals,
    findParticipant,
    participantIdentifiers,
    sameIdentity,
    shortJid,
} = require('../../utils/antiBotSignals');

module.exports = {
    name: 'antibot',
    aliases: ['nobot', 'antibots'],
    description: 'Automatically detect and remove other bots from the group',
    category: 'admin',

    async execute({ sock, reply, args, from, isGroup, isAdmin }) {
        if (!isGroup) return reply('👥 This command can only be used in groups!');
        if (!isAdmin) return reply('🛡️ *Admin Only!*\n\n❌ You must be a group admin to use this command.');

        const action = (args[0] || '').toLowerCase();
        const grp = database.getGroup(from);
        const isEnabled = grp.antibot || false;
        const currentMode = grp.antibotMode || 'kick';

        if (!action || !['on', 'off', 'kick', 'warn', 'status', 'scan'].includes(action)) {
            return reply(
                `╔══════════════════════════╗\n` +
                `║      🤖 *ANTI-BOT*       ║\n` +
                `╚══════════════════════════╝\n\n` +
                `Status: ${isEnabled ? '✅ ACTIVE' : '❌ INACTIVE'}\n` +
                `Mode: *${currentMode.toUpperCase()}*\n\n` +
                `*Usage:*\n` +
                `▸ .antibot on     — enable verification + enforcement\n` +
                `▸ .antibot kick   — remove high-confidence bot signatures\n` +
                `▸ .antibot warn   — warn only, no kick\n` +
                `▸ .antibot off    — disable\n` +
                `▸ .antibot scan   — scan & remove bots now\n` +
                `▸ .antibot status — current settings\n\n` +
                `*Protects and detects:*\n` +
                `✓ Sender-bound verification for every non-admin newcomer\n` +
                `✓ Explicit bot metadata and known bot-library ID stamps\n` +
                `✓ Linked-device JIDs treated as candidates, not proof\n` +
                `✓ Scan of current members for high-confidence signatures\n\n` +
                `_Group admins and the bot itself are always exempt._`
            );
        }

        if (action === 'status') {
            return reply(
                `🤖 *Anti-Bot Status*\n\n` +
                `Status: ${isEnabled ? '✅ ACTIVE' : '❌ INACTIVE'}\n` +
                `Mode: *${currentMode.toUpperCase()}*\n\n` +
                `_${isEnabled
                    ? currentMode === 'kick'
                    ? 'New members must pass verification; high-confidence bot signatures are removed.'
                    : 'New members must pass verification; detected bots are warned only.'
                    : 'Enable with .antibot on or .antibot kick'
                }_`
            );
        }

        if (action === 'off') {
            database.setGroup(from, 'antibot', false);
            return reply('❌ *Anti-Bot DISABLED*');
        }

        if (action === 'on' || action === 'kick' || action === 'warn') {
            const mode = action === 'warn' ? 'warn' : 'kick';
            database.setGroup(from, 'antibot', true);
            database.setGroup(from, 'antibotMode', mode);
            return reply(
                `✅ *Anti-Bot ENABLED*\n\n` +
                `Mode: *${mode.toUpperCase()}*\n\n` +
                    `_${mode === 'kick'
                    ? '🦾 New members are verified; high-confidence bots are removed.'
                    : '⚠️ New members are verified; detected bots receive warnings only.'
                }_`
            );
        }

        if (action === 'scan') {
            await reply('🔍 *Scanning group for bots...*');
            try {
                const meta = await sock.groupMetadata(from);
                const botIdentities = [sock.user?.id, sock.user?.lid, sock.user?.jid, sock.user?.phoneNumber].filter(Boolean);
                const botParticipant = meta.participants.find(p =>
                    participantIdentifiers(p).some(id => botIdentities.some(bot => sameIdentity(id, bot)))
                );
                const botIsAdmin = !!botParticipant?.admin;

                const detected = meta.participants.filter(p => {
                    const jid = p.id || p.jid || p.phoneNumber || p.lid;
                    if (!jid || botIdentities.some(bot => sameIdentity(jid, bot))) return false;
                    if (p.admin) return false;
                    return detectBotSignals({ jid, participant: p }).highConfidence;
                });

                const candidates = meta.participants.filter(p => {
                    const jid = p.id || p.jid || p.phoneNumber || p.lid;
                    if (!jid || botIdentities.some(bot => sameIdentity(jid, bot)) || p.admin) return false;
                    const detection = detectBotSignals({ jid, participant: p });
                    return detection.candidate && !detection.highConfidence;
                });

                if (!detected.length) {
                    return reply(
                        `✅ *No high-confidence bots detected!*\n\n` +
                        `Scanned ${meta.participants.length} members.\n` +
                        `${candidates.length ? `⚠️ ${candidates.length} linked-device candidate(s) remain protected by newcomer verification.\n` : ''}` +
                        `_Ordinary linked-device JIDs are not treated as proof of automation._`
                    );
                }

                const list = detected.map(p => {
                    const jid = p.id || p.jid || p.phoneNumber || p.lid;
                    const detection = detectBotSignals({ jid, participant: p });
                    return `• @${shortJid(jid)} — ${detection.reason || 'high-confidence signature'}`;
                }).join('\n');
                if (!botIsAdmin) {
                    return reply(
                        `🤖 *${detected.length} bot(s) found:*\n\n${list}\n\n` +
                        `❌ I need to be a *group admin* to remove them.\n` +
                        `_Promote me first, then run .antibot scan again._`
                    );
                }

                await reply(
                    `🤖 *${detected.length} bot(s) detected:*\n\n${list}\n\n` +
                    `_Removing now..._`
                );

                let removed = 0;
                for (const bot of detected) {
                    try {
                        const botJid = bot.id || bot.jid || bot.phoneNumber || bot.lid;
                        await sock.groupParticipantsUpdate(from, [botJid], 'remove');
                        removed++;
                        await new Promise(r => setTimeout(r, 600));
                    } catch (_) {}
                }

                return reply(`✅ Removed *${removed}/${detected.length}* bot(s) from the group.`);
            } catch (err) {
                return reply(`❌ Scan failed: ${err.message}`);
            }
        }
    },
};

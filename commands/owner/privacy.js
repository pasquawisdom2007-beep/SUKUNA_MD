'use strict';

const PRIVACY_VALUES = new Set(['all', 'contacts', 'contact_blacklist', 'none']);
const valueOf = value => String(value || '').toLowerCase();

function formatPrivacy(settings = {}) {
    const labels = {
        last: 'Last seen', online: 'Online', profile: 'Profile photo', status: 'Status',
        groupadd: 'Groups', calladd: 'Calls', readreceipts: 'Read receipts', messages: 'Messages',
    };
    const rows = Object.entries(labels).map(([key, label]) => `• ${label}: ${settings[key] || 'unknown'}`);
    return `🔐 *My privacy settings*\n${rows.join('\n')}`;
}

async function updatePrivacy(sock, method, args, label, reply) {
    const value = valueOf(args[0]);
    if (!PRIVACY_VALUES.has(value)) return reply(`⚠️ Usage: .${method} all|contacts|none`);
    const fn = {
        lastseen: 'updateLastSeenPrivacy', setonline: 'updateOnlinePrivacy', pfpprivacy: 'updateProfilePicturePrivacy',
        statusprivacy: 'updateStatusPrivacy', groupprivacy: 'updateGroupsAddPrivacy', callsprivacy: 'updateCallPrivacy',
    }[method];
    if (typeof sock[fn] !== 'function') return reply(`❌ ${label} is not supported by this Baileys build.`);
    await sock[fn](value);
    return reply(`✅ ${label} privacy set to *${value}*.`);
}

module.exports = {
    name: 'privacy',
    aliases: ['privacysettings'],
    description: 'Manage account privacy settings',
    category: 'owner',
    ownerOnly: true,
    async execute({ sock, args, reply, from, database }) {
        const sub = valueOf(args[0]);
        if (sub === 'myprivacy' || sub === 'status') {
            const settings = typeof sock.fetchPrivacySettings === 'function' ? await sock.fetchPrivacySettings(true) : {};
            return reply(formatPrivacy(settings));
        }
        if (sub === 'disappearing') {
            const seconds = Number(args[1]);
            if (!Number.isFinite(seconds) || seconds < 0) return reply('⚠️ Usage: .disappearing 86400');
            if (typeof sock.updateDefaultDisappearingMode !== 'function') return reply('❌ Disappearing mode is unsupported by this Baileys build.');
            await sock.updateDefaultDisappearingMode(seconds);
            return reply(`✅ Default disappearing messages set to ${seconds} seconds.`);
        }
        if (sub === 'readreceipts') {
            const value = valueOf(args[1]);
            if (!['on', 'off'].includes(value)) return reply('⚠️ Usage: .readreceipts on|off');
            if (typeof sock.updateReadReceiptsPrivacy !== 'function') return reply('❌ Read-receipt privacy is unsupported by this Baileys build.');
            await sock.updateReadReceiptsPrivacy(value === 'on' ? 'all' : 'none');
            return reply(`✅ Read receipts turned *${value}*.`);
        }
        if (sub === 'lastseen' || sub === 'setonline' || sub === 'pfpprivacy' || sub === 'statusprivacy' || sub === 'groupprivacy' || sub === 'callsprivacy') {
            return updatePrivacy(sock, sub, args.slice(1), sub, reply);
        }
        if (sub === 'lastactivity') {
            const target = args[1] || args[0];
            const stamp = database.getLastSeen(from, target);
            return reply(stamp ? `🕒 Last recorded activity: ${new Date(typeof stamp === 'object' ? stamp.lastSeen : stamp).toLocaleString()}` : '🕒 No recorded activity for that user.');
        }
        return reply('🔐 Use `.privacy myprivacy`, `.privacy lastseen all`, `.privacy readreceipts on`, or `.privacy disappearing 86400`.');
    },
};

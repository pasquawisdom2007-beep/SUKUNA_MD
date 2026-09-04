'use strict';

const jid = value => {
    const raw = String(value || '').trim().replace(/^@/, '');
    if (!raw) return null;
    if (/@(g|c)\.us$/.test(raw) || /@s\.whatsapp\.net$/.test(raw)) return raw;
    if (/^\d{7,16}$/.test(raw)) return `${raw}@s.whatsapp.net`;
    return null;
};

const requireMethod = (sock, method, reply) => {
    if (typeof sock[method] !== 'function') {
        reply(`❌ This Pasqua Baileys build does not expose ${method}.`);
        return false;
    }
    return true;
};

async function executeCommunity({ name, sock, args, reply }) {
    try {
        if (name === 'createcommunity') {
            const subject = args[0];
            if (!subject) return reply('⚠️ Usage: .createcommunity <name> [description]');
            if (!requireMethod(sock, 'communityCreate', reply)) return;
            const metadata = await sock.communityCreate(subject, args.slice(1).join(' '));
            return reply(`✅ Community created: *${subject}*${metadata?.id ? `\n${metadata.id}` : ''}`);
        }
        if (name === 'leavecommunity') {
            const community = jid(args[0]);
            if (!community) return reply('⚠️ Usage: .leavecommunity <community_jid>');
            if (!requireMethod(sock, 'communityLeave', reply)) return;
            await sock.communityLeave(community);
            return reply('✅ Left the community.');
        }
        if (name === 'communitygroup') {
            const community = jid(args[0]);
            const subject = args.slice(1).join(' ');
            if (!community || !subject) return reply('⚠️ Usage: .communitygroup <community_jid> <group_name>');
            if (!requireMethod(sock, 'communityCreateGroup', reply)) return;
            const group = await sock.communityCreateGroup(subject, [], community);
            return reply(`✅ Community group created: *${subject}*${group?.id ? `\n${group.id}` : ''}`);
        }
        if (name === 'communityname') {
            const community = jid(args[0]);
            const subject = args.slice(1).join(' ');
            if (!community || !subject) return reply('⚠️ Usage: .communityname <community_jid> <new_name>');
            if (!requireMethod(sock, 'communityUpdateSubject', reply)) return;
            await sock.communityUpdateSubject(community, subject);
            return reply('✅ Community name updated.');
        }
        if (name === 'linkgroup' || name === 'unlinkgroup') {
            const community = jid(args[0]);
            const group = jid(args[1]);
            if (!community || !group) return reply(`⚠️ Usage: .${name} <community_jid> <group_jid>`);
            const method = name === 'linkgroup' ? 'communityLinkGroup' : 'communityUnlinkGroup';
            if (!requireMethod(sock, method, reply)) return;
            await sock[method](group, community);
            return reply(`✅ Group ${name === 'linkgroup' ? 'linked to' : 'unlinked from'} the community.`);
        }
        if (name === 'linkedgroups') {
            const community = jid(args[0]);
            if (!community) return reply('⚠️ Usage: .linkedgroups <community_jid>');
            if (!requireMethod(sock, 'communityFetchLinkedGroups', reply)) return;
            const result = await sock.communityFetchLinkedGroups(community);
            return reply(`🔗 Linked groups:\n${(result.linkedGroups || []).map(group => `• ${group.subject || 'Unnamed'} — ${group.id}`).join('\n') || 'No linked groups found.'}`);
        }
        if (name === 'mycommunities') {
            if (!requireMethod(sock, 'communityFetchAllParticipating', reply)) return;
            const result = await sock.communityFetchAllParticipating();
            return reply(`🏘️ Communities:\n${Object.values(result || {}).map(item => `• ${item.subject || item.name || 'Unnamed'} — ${item.id}`).join('\n') || 'No communities found.'}`);
        }
        if (name === 'communityinfo') {
            const community = jid(args[0]);
            if (!community) return reply('⚠️ Usage: .communityinfo <community_jid>');
            if (!requireMethod(sock, 'communityMetadata', reply)) return;
            const metadata = await sock.communityMetadata(community);
            return reply(`🏘️ *${metadata.subject || 'Community'}*\nID: ${metadata.id}\nMembers: ${metadata.size || metadata.participants?.length || 'n/a'}\nDescription: ${metadata.desc || 'none'}`);
        }
        if (['addtocommunity', 'removefromcommunity', 'communityadmin', 'communitydemote'].includes(name)) {
            const community = jid(args[0]);
            const participant = jid(args[1]);
            if (!community || !participant) return reply(`⚠️ Usage: .${name} <community_jid> <user_jid>`);
            const action = { addtocommunity: 'add', removefromcommunity: 'remove', communityadmin: 'promote', communitydemote: 'demote' }[name];
            if (!requireMethod(sock, 'communityParticipantsUpdate', reply)) return;
            const result = await sock.communityParticipantsUpdate(community, [participant], action);
            const status = result?.[0]?.status || '200';
            return reply(`✅ Community member action *${action}* completed (status ${status}).`);
        }
        return reply('❌ Unknown community command.');
    } catch (error) {
        console.error(`[COMMUNITY:${name}]`, error.message);
        return reply(`❌ Community action failed: ${error.message || 'unknown error'}`);
    }
}

module.exports = { executeCommunity };

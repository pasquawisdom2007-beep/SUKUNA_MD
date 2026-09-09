'use strict';

const META_AI_BOT_JID = '867051314767696@bot';

async function addMetaAI(sock, groupJid) {
    // The Pasqua Baileys fork may expose the dedicated helper when its AI-group
    // layer is enabled. Prefer that over hand-built protocol traffic.
    if (typeof sock.aiGroupAddBot === 'function') {
        return sock.aiGroupAddBot(groupJid, META_AI_BOT_JID.replace('@bot', ''));
    }

    // Normal sockets still expose the authenticated query transport. This is
    // the same w:g2 operation used by the fork's makeAIGroupsSocket helper.
    if (typeof sock.query !== 'function') {
        throw new Error('This Baileys socket does not support Meta AI group operations.');
    }

    const response = await sock.query({
        tag: 'iq',
        attrs: {
            type: 'set',
            xmlns: 'w:g2',
            to: groupJid,
        },
        content: [{
            tag: 'add',
            attrs: {},
            content: [{
                tag: 'participant',
                attrs: { jid: META_AI_BOT_JID },
            }],
        }],
    });

    const addNode = Array.isArray(response?.content)
        ? response.content.find(node => node?.tag === 'add')
        : null;
    const participant = Array.isArray(addNode?.content)
        ? addNode.content.find(node => node?.tag === 'participant')
        : null;
    const error = participant?.attrs?.error;
    if (error && String(error) !== '200') {
        throw new Error(`WhatsApp rejected the Meta AI request (code ${error}).`);
    }
    return [{ status: String(error || '200'), jid: META_AI_BOT_JID }];
}

module.exports = {
    name: 'addmetaai',
    aliases: ['metaai', 'addai', 'inviteai'],
    description: 'Add Meta AI to the current WhatsApp group',
    category: 'group',
    groupOnly: true,
    adminOnly: true,

    async execute({ sock, from, reply, isGroup, isAdmin }) {
        if (!isGroup) return reply('👥 This command can only be used inside a group.');
        if (!isAdmin) return reply('🛡️ Only group admins can add Meta AI.');

        await reply('⏳ Adding Meta AI to this group…');
        try {
            const result = await addMetaAI(sock, from);
            const failed = Array.isArray(result) && result.find(item => String(item?.status) !== '200');
            if (failed) {
                return reply(`❌ WhatsApp rejected the request (code ${failed.status}). Meta AI may not be available for this account or region.`);
            }
            return reply(
                '✅ *Meta AI add request sent.*\n\n' +
                'If WhatsApp supports Meta AI groups on this account, it should now appear in the participant list.\n' +
                'You can then mention Meta AI in the group to use it.'
            );
        } catch (error) {
            console.error('[addmetaai]', error);
            return reply(
                '❌ *Could not add Meta AI.*\n\n' +
                `${error.message}\n\n` +
                'The feature depends on WhatsApp account/region availability and the installed Baileys fork.'
            );
        }
    },
};

module.exports.addMetaAI = addMetaAI;
module.exports.META_AI_BOT_JID = META_AI_BOT_JID;


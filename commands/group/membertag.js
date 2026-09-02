'use strict';

/**
 * Set the sender's custom member label in the current WhatsApp group.
 *
 * WhatsApp accepts the label through a protocolMessage with type 30. The
 * label is limited to 30 Unicode code points, so Array.from() is used instead
 * of String#slice() to avoid splitting emoji or other surrogate pairs.
 */

function limitLabel(value, maxLength = 30) {
    return Array.from(String(value || '')).slice(0, maxLength).join('');
}

async function groupLabel(sock, targetGroupJid, text) {
    const label = limitLabel(text);

    if (!label.trim()) {
        throw new Error('Please provide a member tag.');
    }

    await sock.relayMessage(
        targetGroupJid,
        {
            protocolMessage: {
                type: 30,
                memberLabel: {
                    label,
                },
            },
        },
        {
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: {
                        tag_reason: 'user_update',
                        appdata: 'member_tag',
                    },
                    content: undefined,
                },
            ],
        }
    );

    return label;
}

module.exports = {
    name: 'membertag',
    aliases: ['settag', 'tag'],
    description: 'Set your custom member tag in this group',
    category: 'group',
    groupOnly: true,

    async execute({ sock, from, reply, args, isGroup }) {
        if (!isGroup || !from || !from.endsWith('@g.us')) {
            return reply('This command can only be used in a group.');
        }

        const requestedLabel = args.join(' ');
        if (!requestedLabel.trim()) {
            return reply('Usage: .membertag <your tag>\nExample: .membertag TsM Snøwi');
        }

        try {
            const label = await groupLabel(sock, from, requestedLabel);
            return reply(`Your member tag was updated to: ${label}`);
        } catch (error) {
            console.error('[membertag]', error?.stack || error);
            return reply(`Failed to update your member tag: ${error.message}`);
        }
    },

    // Exported for focused tests without starting a WhatsApp session.
    groupLabel,
    limitLabel,
};

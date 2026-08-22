'use strict';

const { prepareWAMessageMedia, generateMessageIDV2 } = require('@pasqua-baileys/baileys');

module.exports = {
    name: 'invite',
    aliases: ['grouplink', 'glink'],
    category: 'group',
    adminOnly: true,
    groupOnly: true,

    execute: async (context) => {
        const { sock, from, reply } = context;
        try {
            if (!from || !from.includes('@g.us')) {
                return reply('Group only');
            }

            const meta = await sock.groupMetadata(from);
            const groupName = meta.subject;

            // Get invite code
            let inviteCode;
            try {
                inviteCode = await sock.groupInviteCode(from);
            } catch (err) {
                console.error('[invite]', err.message);
                return reply('Need admin rights to generate link');
            }

            const inviteLink = `https://chat.whatsapp.com/${inviteCode}?mode=gi_t`;

            // Get group photo URL
            let photoUrl = null;
            try {
                photoUrl = await sock.profilePictureUrl(from, 'image');
            } catch {}

            // Upload via mediaTypeOverride for clean thumbnail without blue tint
            let hq = null;
            let smallThumb = null;
            if (photoUrl) {
                try {
                    const prepared = await prepareWAMessageMedia(
                        { image: { url: photoUrl } },
                        { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
                    );
                    hq = prepared.imageMessage;
                    smallThumb = hq?.jpegThumbnail ? Buffer.from(hq.jpegThumbnail) : null;
                } catch (err) {
                    console.error('[thumbnail upload]', err.message);
                }
            }

            // Build extendedTextMessage with image preview (not blue link)
            const message = {
                extendedTextMessage: {
                    text: inviteLink,
                    matchedText: inviteLink,
                    canonicalUrl: inviteLink,
                    title: groupName,
                    description: `${meta.participants?.length || 0} members · WhatsApp Group Invite`,
                    previewType: 5, // IMAGE - not blue link
                    jpegThumbnail: smallThumb || undefined,
                    ...(hq ? {
                        thumbnailDirectPath: hq.directPath,
                        mediaKey: hq.mediaKey,
                        mediaKeyTimestamp: hq.mediaKeyTimestamp,
                        thumbnailWidth: hq.width,
                        thumbnailHeight: hq.height,
                        thumbnailSha256: hq.fileSha256,
                        thumbnailEncSha256: hq.fileEncSha256,
                    } : {})
                }
            };

            const messageId = generateMessageIDV2(sock.user.id);
            await sock.relayMessage(from, message, { messageId });

            return reply('✓ Group link sent');

        } catch (err) {
            console.error('[invite]', err.message);
            reply('Failed to send link');
        }
    }
};

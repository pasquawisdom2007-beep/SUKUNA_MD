'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
const { addExif } = require('../../library/exif');

module.exports = {
    name: 'sprem',
    aliases: ['stickerprem', 'spremium'],
    category: 'Media',
    desc: 'Convert image/video to premium sticker with metadata',

    execute: async (context) => {
        const { sock, msg, from, reply } = context;

        try {
            // Extract contextInfo from the current message
            const ctx =
                msg.message?.extendedTextMessage?.contextInfo ||
                msg.message?.imageMessage?.contextInfo ||
                msg.message?.videoMessage?.contextInfo ||
                msg.message?.stickerMessage?.contextInfo ||
                msg.message?.documentMessage?.contextInfo ||
                msg.message?.audioMessage?.contextInfo || null;

            const quotedMessage = ctx?.quotedMessage;

            if (!quotedMessage) {
                return reply('Reply to an image, video, or sticker');
            }

            // Check for image, video, or sticker in quoted message
            const hasImage = quotedMessage.imageMessage;
            const hasVideo = quotedMessage.videoMessage;
            const hasSticker = quotedMessage.stickerMessage;

            if (!hasImage && !hasVideo && !hasSticker) {
                return reply('Reply to an image, video, or sticker');
            }

            await reply('Converting to premium sticker...');

            // Download media using the quoted message
            let media = null;
            try {
                if (hasImage) {
                    const stream = await downloadContentFromMessage(quotedMessage.imageMessage, 'image');
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    media = Buffer.concat(chunks);
                } else if (hasVideo) {
                    const stream = await downloadContentFromMessage(quotedMessage.videoMessage, 'video');
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    media = Buffer.concat(chunks);
                } else if (hasSticker) {
                    const stream = await downloadContentFromMessage(quotedMessage.stickerMessage, 'sticker');
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    media = Buffer.concat(chunks);
                }

                if (!media || media.length === 0) {
                    return reply('Could not download media');
                }
            } catch (err) {
                console.error('[media download]', err.message);
                return reply('Failed to download media');
            }

            // Create temp directory
            const tempDir = path.join(__dirname, '../../temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const timestamp = Date.now();
            const input = path.join(tempDir, `sprem_${timestamp}`);
            const output = `${input}.webp`;

            try {
                fs.writeFileSync(input, media);
            } catch (err) {
                console.error('[write temp]', err.message);
                return reply('Failed to save temporary file');
            }

            // Convert to webp based on media type
            try {
                if (hasSticker) {
                    // Already a sticker (WebP) - just copy
                    fs.copyFileSync(input, output);
                } else if (hasVideo) {
                    // Video to animated sticker
                    const videoCmd = `ffmpeg -y -i "${input}" -vf "fps=15,scale=512:512:force_original_aspect_ratio=increase,crop=512:512:(iw-ow)/2:(ih-oh)/2,format=yuva420p" -c:v libwebp -lossless 0 -q:v 70 -loop 0 -an -preset default -compression_level 6 "${output}"`;
                    
                    await new Promise((resolve, reject) => {
                        exec(videoCmd, (err) => {
                            if (err) {
                                console.error('[ffmpeg video]', err.message);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                } else if (hasImage) {
                    // Image to sticker
                    const imgCmd = `ffmpeg -y -i "${input}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512:(iw-ow)/2:(ih-oh)/2,format=yuva420p" -c:v libwebp -lossless 0 -q:v 80 -an "${output}"`;
                    
                    await new Promise((resolve, reject) => {
                        exec(imgCmd, (err) => {
                            if (err) {
                                console.error('[ffmpeg image]', err.message);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                }
            } catch (err) {
                console.error('[conversion]', err.message);
                // Cleanup on failure
                try {
                    if (fs.existsSync(input)) fs.unlinkSync(input);
                    if (fs.existsSync(output)) fs.unlinkSync(output);
                } catch {}
                return reply('Conversion failed');
            }

            // Read converted WebP
            let stickerBuffer = null;
            try {
                stickerBuffer = fs.readFileSync(output);
            } catch (err) {
                console.error('[read output]', err.message);
                return reply('Failed to read converted sticker');
            }

            // Add EXIF metadata
            try {
                stickerBuffer = await addExif(stickerBuffer, 'SUKUNA MD', 'sukuna', ['🔥']);
            } catch (err) {
                console.error('[exif]', err.message);
                // Continue with untagged sticker if exif fails
            }

            // Send as premium sticker
            try {
                await sock.sendMessage(from, {
                    sticker: stickerBuffer,
                    premium: 1
                }, { quoted: msg });

                await reply('✓ Premium sticker sent!');
            } catch (err) {
                console.error('[send sticker]', err.message);
                return reply('Failed to send sticker');
            }

            // Cleanup
            try {
                if (fs.existsSync(input)) fs.unlinkSync(input);
                if (fs.existsSync(output)) fs.unlinkSync(output);
            } catch (err) {
                console.error('[cleanup]', err.message);
            }

        } catch (err) {
            console.error('[sprem]', err.message);
            reply('Sticker conversion failed');
        }
    }
};

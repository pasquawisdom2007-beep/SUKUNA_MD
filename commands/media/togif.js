const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const sharp = require('sharp');
const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

module.exports = {
    name: 'togif',
    aliases: ['sticker2gif', 'stktogif'],
    category: 'Media',
    desc: 'Convert sticker to GIF with watermark',

    execute: async (context) => {
        try {
            const { sock, msg, from, reply } = context;

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
                return reply('Reply to a sticker, image, or video');
            }

            // Check for sticker, image, or video in quoted message
            const hasSticker = quotedMessage.stickerMessage;
            const hasImage = quotedMessage.imageMessage;
            const hasVideo = quotedMessage.videoMessage;

            if (!hasSticker && !hasImage && !hasVideo) {
                return reply('Reply to a sticker, image, or video');
            }

            await reply('⏳ Converting to GIF...');

            // Download media using the quoted message
            let mediaBuffer = null;
            try {
                if (hasImage) {
                    const stream = await downloadContentFromMessage(quotedMessage.imageMessage, 'image');
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    mediaBuffer = Buffer.concat(chunks);
                } else if (hasVideo) {
                    const stream = await downloadContentFromMessage(quotedMessage.videoMessage, 'video');
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    mediaBuffer = Buffer.concat(chunks);
                } else if (hasSticker) {
                    const stream = await downloadContentFromMessage(quotedMessage.stickerMessage, 'sticker');
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    mediaBuffer = Buffer.concat(chunks);
                }

                if (!mediaBuffer || mediaBuffer.length === 0) {
                    return reply('Cannot download media');
                }
            } catch (err) {
                console.error('[media download]', err.message);
                return reply('Failed to download media');
            }

            // Determine if we're dealing with video
            const isVideo = hasVideo;
            
            // Get metadata
            let metadata = null;
            let isAnimated = false;
            
            try {
                metadata = await sharp(mediaBuffer).metadata();
                isAnimated = (metadata.pages && metadata.pages > 1) || isVideo;
            } catch (err) {
                console.error('[metadata]', err.message);
                // For videos, if sharp fails, just treat as animated
                isAnimated = isVideo;
                metadata = { pages: 1, delay: [100] };
            }
            const tempDir = path.join(process.cwd(), 'temp');

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            if (isAnimated) {
                try {
                    const frameDir = path.join(tempDir, `frames_${Date.now()}`);
                    const outputPath = path.join(tempDir, `gif_${Date.now()}.mp4`);

                    fs.mkdirSync(frameDir, { recursive: true });

                    // Extract frames
                    const frames = [];
                    for (let i = 0; i < (metadata.pages || 1); i++) {
                        const frameFile = path.join(frameDir, `frame_${String(i).padStart(4, '0')}.png`);
                        frames.push(
                            sharp(mediaBuffer, { page: i })
                                .resize(512, 512, { fit: 'cover' })
                                .png()
                                .toFile(frameFile)
                        );
                    }

                    await Promise.all(frames);

                    // Calculate FPS
                    const delay = metadata.delay?.[0] || 100;
                    const fps = Math.max(10, Math.min(30, Math.round(1000 / delay)));

                    // Create GIF using ffmpeg-style command
                    const cmd = `ffmpeg -y -framerate ${fps} -i "${frameDir}/frame_%04d.png" -vf "scale=512:-1:flags=lanczos,drawtext=text='SUKUNA MD':x=(w-text_w)/2:y=(h-text_h)-20:fontsize=20:fontcolor=white@0.7:borderw=1:bordercolor=black@0.8" -loop 0 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "${outputPath}"`;

                    await new Promise((resolve, reject) => {
                        exec(cmd, (err) => {
                            if (err) {
                                console.error('[ffmpeg]', err.message);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });

                    // Send as GIF
                    const buffer = fs.readFileSync(outputPath);
                    await sock.sendMessage(from, {
                        video: buffer,
                        gifPlayback: true,
                        caption: 'Sticker GIF'
                    }, { quoted: msg });

                    // Cleanup
                    fs.rmSync(frameDir, { recursive: true, force: true });
                    fs.unlinkSync(outputPath);

                    await reply('✓ GIF sent');

                } catch (err) {
                    console.error('[animated conversion]', err.message);
                    return reply('Failed to convert animated sticker');
                }

            } else {
                // Static sticker - convert to image
                try {
                    const img = await sharp(mediaBuffer)
                        .resize(512, 512, { fit: 'cover' })
                        .png()
                        .toBuffer();

                    await sock.sendMessage(from, {
                        image: img,
                        caption: 'Sticker converted'
                    }, { quoted: msg });

                    await reply('✓ Image sent');

                } catch (err) {
                    console.error('[static conversion]', err.message);
                    return reply('Failed to convert sticker');
                }
            }

        } catch (err) {
            console.error('[togif]', err.message);
            context.reply('Conversion failed');
        }
    }
};

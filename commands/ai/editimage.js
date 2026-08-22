/**
 * Edit Image Command
 * Usage: .editimage <prompt>  (reply to an image or static sticker)
 *
 * Single provider, no fallbacks: David Cyril "NanoBanana" img2img
 * (https://apis.davidcyril.name.ng/nanobanana) — real img2img via Google's
 * Gemini "Nano Banana" model. This is the ONLY provider this command uses.
 * If it fails, the command reports the error instead of silently swapping
 * to a different AI/provider.
 *
 * NanoBanana takes a public image URL, not a raw file upload, so the
 * source image (or converted sticker) is first uploaded to ImgBB to get
 * that URL. ImgBB requires a free API key — set IMGBB_API_KEY in your
 * .env (see .env.example). Get one at https://api.imgbb.com/.
 */

const axios = require('axios');
const { downloadMediaMessage } = require('@pasqua-baileys/baileys');
const sharp = require('sharp');
const config = require('../../config');
const { extractBestUrl } = require('../../lib/mediaFetch');

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || config.apiKeys?.imgbb || '';

// Optional sticker -> png helper
let webp2png = null;
try {
  ({ webp2png } = require('../../utils/webp2mp4'));
} catch (_) {}

// ─── Step 0: image -> public URL via ImgBB (so NanoBanana can fetch it) ─────
async function uploadToImgbb(imageBuffer) {
  if (!IMGBB_API_KEY) {
    throw new Error(
      'IMGBB_API_KEY is not set. Add it to your .env file (free key at https://api.imgbb.com/).'
    );
  }

  // ImgBB accepts a urlencoded body with the image as a base64 string.
  // Using URLSearchParams avoids the external 'form-data' dependency and
  // works natively with axios on any Node 18+ runtime.
  const body = new URLSearchParams();
  body.append('image', imageBuffer.toString('base64'));

  const { data } = await axios.post('https://api.imgbb.com/1/upload', body, {
    params: { key: IMGBB_API_KEY },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
  });

  const url = data?.data?.url || data?.data?.display_url;
  if (!url) {
    throw new Error(`ImgBB upload did not return a usable URL: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return url;
}

// ─── NanoBanana (David Cyril) — THE provider, no fallback ───────────────────
async function nanoBananaEdit(imageBuffer, prompt) {
  const imageUrl = await uploadToImgbb(imageBuffer);

  const response = await axios.get('https://apis.davidcyril.name.ng/nanobanana', {
    params: { prompt, imageUrl },
    responseType: 'arraybuffer',
    timeout: 120000,
    validateStatus: () => true,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });

  const raw = Buffer.from(response.data);
  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();

  if (response.status >= 400) {
    // Surface whatever the API actually said, instead of swapping providers.
    let detail = '';
    try { detail = raw.toString('utf8').slice(0, 300); } catch (_) {}
    throw new Error(`NanoBanana API returned ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  // Case 1: API returned the edited image bytes directly.
  if (contentType.startsWith('image/') && raw.length > 256) {
    return raw;
  }

  // Case 2: API returned JSON — walk it for the result URL.
  let json = null;
  try { json = JSON.parse(raw.toString('utf8')); } catch (_) {}
  if (json) {
    const best = extractBestUrl(json);
    if (!best?.url) {
      throw new Error(`NanoBanana API response had no result URL: ${JSON.stringify(json).slice(0, 300)}`);
    }
    const img = await axios.get(best.url, { responseType: 'arraybuffer', timeout: 60000 });
    const buf = Buffer.from(img.data);
    if (!buf || buf.length < 256) {
      throw new Error('NanoBanana result URL returned an empty/invalid image');
    }
    return buf;
  }

  // Unlabeled binary that isn't JSON and isn't tagged image/* — accept if
  // it looks like real data.
  if (raw.length > 256) return raw;

  throw new Error('NanoBanana API returned an empty response');
}

// ─── Main Command ─────────────────────────────────────────────────────────────
module.exports = {
  name: 'editimage',
  aliases: ['gptimage', 'gptimg', 'aiimage', 'vision', 'gi', 'ei'],
  category: 'ai',
  description: 'Edit an image using AI with a text prompt (NanoBanana)',
  usage: '.editimage <prompt> (reply to image/sticker)',

  async execute({ sock, msg, args, from, reply, prefix }) {
    const px = prefix || '.';
    try {
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctxInfo?.quotedMessage) {
        return await reply(
          '📷 *Edit Image (AI)*\n\n' +
          'Reply to an *image* or *sticker* with a prompt to edit it.\n\n' +
          `Usage: ${px}editimage <your prompt>\n\n` +
          `Example: ${px}editimage change the background to a beach`
        );
      }

      const prompt = (args || []).join(' ').trim();
      if (!prompt) {
        return await reply(
          '❌ Please provide a prompt!\n\n' +
          `Usage: ${px}editimage <your prompt>\n\n` +
          'Example: change the background to a beach'
        );
      }

      const quotedMsg = ctxInfo.quotedMessage;
      const isImage = !!quotedMsg.imageMessage;
      const isSticker = !!quotedMsg.stickerMessage;

      if (!isImage && !isSticker) {
        return await reply('❌ Please reply to an *image* or *sticker*!');
      }

      await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

      // Download media
      const targetMessage = {
        key: {
          remoteJid: from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: ctxInfo.quotedMessage,
      };

      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!mediaBuffer) {
        return await reply('❌ Failed to download image. Please try again.');
      }

      // Convert sticker to PNG if needed
      let imageBuffer = mediaBuffer;
      if (isSticker) {
        const isAnimated =
          quotedMsg.stickerMessage?.isAnimated ||
          quotedMsg.stickerMessage?.mimetype?.includes('animated');
        if (isAnimated) {
          return await reply('❌ Animated stickers are not supported. Use a static image or sticker.');
        }
        try {
          imageBuffer = webp2png
            ? await webp2png(mediaBuffer)
            : await sharp(mediaBuffer).png().toBuffer();
        } catch (err) {
          console.error('Sticker to PNG conversion failed:', err);
          return await reply('❌ Failed to convert sticker. Please try a regular image.');
        }
      }

      // Normalize to JPEG
      let finalImageBuffer = imageBuffer;
      try {
        const meta = await sharp(imageBuffer).metadata();
        if (meta.format !== 'jpeg' && meta.format !== 'jpg') {
          finalImageBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
        }
      } catch (err) {
        console.error('sharp processing error:', err.message);
        // Continue with original buffer
      }

      let resultBuffer;
      try {
        resultBuffer = await nanoBananaEdit(finalImageBuffer, prompt);
      } catch (err) {
        console.error('[editimage] NanoBanana failed:', err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await reply(`❌ NanoBanana API error: ${err.message}`);
      }

      if (!resultBuffer || resultBuffer.length === 0) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await reply('❌ NanoBanana API returned no image. Please try again.');
      }

      // Size guard
      const maxSize = 5 * 1024 * 1024;
      if (resultBuffer.length > maxSize) {
        try {
          resultBuffer = await sharp(resultBuffer).jpeg({ quality: 70 }).toBuffer();
        } catch (_) {}
        if (resultBuffer.length > maxSize) {
          return await reply(
            `❌ Result image is too large (${(resultBuffer.length / 1024 / 1024).toFixed(2)} MB). Try a different image.`
          );
        }
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
      await sock.sendMessage(
        from,
        {
          image: resultBuffer,
          caption:
            `✨ *Edit Image Result*\n\n` +
            `📝 Prompt: ${prompt}\n` +
            `🤖 Provider: NanoBanana (David Cyril)\n\n` +
            `> Powered by SUKUNA MD`,
        },
        { quoted: msg }
      );
    } catch (error) {
      console.error('Error in editimage command:', error);
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return await reply('❌ Request timed out. Please try again.');
      }
      return await reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
    }
  },
};

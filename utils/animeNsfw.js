'use strict';

const API_URL = 'https://nekobot.xyz/api/image';
const REQUEST_TIMEOUT_MS = 15000;

async function fetchAnimeImage(type) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`${API_URL}?type=${encodeURIComponent(type)}`, {
            headers: { accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Nekobot returned HTTP ${response.status}`);
        const payload = await response.json();
        const imageUrl = typeof payload?.message === 'string' ? payload.message : payload?.url;
        if (!payload?.success || !/^https?:\/\//i.test(imageUrl || '')) {
            throw new Error('Nekobot returned no usable image URL');
        }
        return imageUrl;
    } finally {
        clearTimeout(timer);
    }
}

async function sendAnimeNsfw({ sock, msg, from, reply }, type, label) {
    try {
        const imageUrl = await fetchAnimeImage(type);
        await sock.sendMessage(from, {
            image: { url: imageUrl },
            caption: `🔞 *${label}*\n\n> Anime NSFW · 18+ only`,
        }, { quoted: msg });
    } catch (error) {
        console.error(`[anime-nsfw:${type}]`, error.message);
        await reply('❌ The Anime NSFW service is temporarily unavailable. Please try again later.');
    }
}

module.exports = { API_URL, fetchAnimeImage, sendAnimeNsfw };

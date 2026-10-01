/**
 * Facebook Video Downloader Command
 * Bulletproof Version 2.3 by Manus (July 2026)
 * Usage: .fb <url>
 */

const axios = require("axios");

function pickFacebookVideoUrl(payload) {
    if (!payload) return null;
    const roots = [payload, payload.data, payload.result, payload.data?.result].filter(Boolean);
    for (const root of roots) {
        const links = root.download_links || root.downloads || root.links;
        if (Array.isArray(links)) {
            const preferred = links.find(item => /720|1080|hd/i.test(item?.quality || item?.label || '')) || links[0];
            const url = typeof preferred === 'string' ? preferred : preferred?.url;
            if (/^https?:\/\//i.test(url || '')) return url;
        }
        for (const key of ['video', 'videoUrl', 'video_url', 'download_url', 'downloadUrl', 'url', 'hd', 'sd', 'mp4']) {
            const value = root[key];
            if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
        }
    }
    return null;
}

module.exports = {
    name: "facebook",
    aliases: ["fb", "fbdl", "fbvideo"],
    description: "Download Facebook videos/reels with maximum reliability",
    category: "media",
    async execute({ sock, msg, from, reply, args }) {
        console.log(`[fb] Command received for URL: ${args[0]}`); // Added for debugging responsiveness

        const url = args.join(' ').trim();
        if (!url || (!/facebook\.com/i.test(url) && !/fb\.watch/i.test(url))) {
            return reply("🎬 *FACEBOOK DOWNLOADER*\n\nPlease provide a valid Facebook video or reel URL.\nExample: .fb https://www.facebook.com/reel/123456789/");
        }

        try {
            await sock.sendMessage(from, { react: { text: "🎬", key: msg.key } });
            await reply("⏳ *Analyzing Facebook link...* Using multi-stage robust engines.");

            let videoUrl = null;
            let usedEngine = "";

            // --- STAGE 1: USER-PROVIDED PREXZY API (Primary) ---
            try {
                console.log("[fb] Trying User-Provided Prexzy API (facebook)...");
                const res = await axios.get(`https://prexzyapis.com/download/facebook?url=${encodeURIComponent(url)}`, { timeout: 25000 });
                if (res.data.status) {
                    videoUrl = pickFacebookVideoUrl(res.data);
                    if (videoUrl) usedEngine = "User-Provided Prexzy Engine (facebook)";
                }
            } catch (e) {
                console.error("[fb] User-Provided Prexzy API (facebook) failed:", e.message);
            }

            // --- STAGE 2: USER-PROVIDED PREXZY API (facebookv2) ---
            if (!videoUrl) {
                try {
                    console.log("[fb] Trying User-Provided Prexzy API (facebookv2)...");
                    const res = await axios.get(`https://prexzyapis.com/download/facebookv2?url=${encodeURIComponent(url)}`, { timeout: 25000 });
                    if (res.data.status) {
                        videoUrl = pickFacebookVideoUrl(res.data);
                        if (videoUrl) usedEngine = "User-Provided Prexzy Engine (facebookv2)";
                    }
                } catch (e) {
                    console.error("[fb] User-Provided Prexzy API (facebookv2) failed:", e.message);
                }
            }

            // --- STAGE 3: MAHER AI API (Fallback) ---
            if (!videoUrl) {
                try {
                    console.log("[fb] Trying Maher AI API...");
                    const res = await axios.get(`https://api.maher-zubair.tech/download/facebook?url=${encodeURIComponent(url)}`, { timeout: 20000 });
                    if (res.data.status) {
                        videoUrl = pickFacebookVideoUrl(res.data);
                        if (videoUrl) usedEngine = "Maher AI Engine";
                    }
                } catch (e) {
                    console.error("[fb] Maher AI failed:", e.message);
                }
            }

            // --- STAGE 4: PREXZY API (Fallback) ---
            if (!videoUrl) {
                try {
                    console.log("[fb] Trying Prexzy API (Alternative)...");
                    const res = await axios.get(`https://prexzyapis.com/media/facebook?url=${encodeURIComponent(url)}`, { timeout: 20000 });
                    if (res.data.status) {
                        videoUrl = pickFacebookVideoUrl(res.data);
                        if (videoUrl) usedEngine = "Prexzy Engine (Alternative)";
                    }
                } catch (e) {
                    console.error("[fb] Prexzy API (Alternative) failed:", e.message);
                }
            }

            // --- STAGE 5: SIPUTZX API (Fallback) ---
            if (!videoUrl) {
                try {
                    console.log("[fb] Trying Siputzx API...");
                    const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`, { timeout: 20000 });
                    if (res.data.status && res.data.data) {
                        videoUrl = pickFacebookVideoUrl(res.data);
                        if (videoUrl) usedEngine = "Siputzx Engine";
                    }
                } catch (e) {
                    console.error("[fb] Siputzx failed:", e.message);
                }
            }

            // --- STAGE 6: ALL-IN-ONE DOWNLOADER (Last Resort) ---
            if (!videoUrl) {
                try {
                    console.log("[fb] Trying All-in-One Downloader...");
                    const res = await axios.get(`https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(url)}`, { timeout: 20000 });
                    if (res.data.status) {
                        videoUrl = pickFacebookVideoUrl(res.data);
                        if (videoUrl) usedEngine = "Vreden Engine";
                    }
                } catch (e) {
                    console.error("[fb] Vreden failed:", e.message);
                }
            }

            // --- FINAL DELIVERY ---
            if (!videoUrl) {
                await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
                return reply("❌ *ERROR:* All Facebook download engines are currently unavailable or failed to retrieve the video.\n\nPossible reasons:\n1. Video is private or deleted.\n2. API limits reached.\n3. Servers are down.\n4. Invalid link format.\n5. The video format is not supported by any available API.");
            }

            // Clean up the URL if it's an object or has extra characters
            const finalUrl = typeof videoUrl === "string" ? videoUrl : pickFacebookVideoUrl(videoUrl);
            if (!finalUrl) return reply("❌ Could not extract a playable Facebook video.");

            await sock.sendMessage(from, {
                video: { url: finalUrl },
                mimetype: "video/mp4",
                caption: `🎬 *FACEBOOK DOWNLOADER*\n\n🔗 *URL:* ${url}\n🚀 *Engine:* ${usedEngine}\n\n> Powered by SUKUNA MD`,
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

        } catch (err) {
            console.error("[fb] Fatal Error:", err.message);
            await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
            reply(`❌ *FATAL ERROR:* ${err.message || "The command encountered an unexpected error."}\n\n*Please ensure the provided URL is a direct link to a public Facebook video or reel.*`);
        }
    },
};

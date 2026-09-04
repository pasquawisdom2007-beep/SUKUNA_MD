/**
 * AI Art Video Command
 * Bulletproof Version by Manus (July 2026)
 * Usage: .aiartvideo <prompt>
 * 
 * STAGES:
 * 1. Replicate (User's Key)
 * 2. Prexzy API (Async Polling)
 * 2.5. FAL.AI (Wan v2.7 - NEW FALLBACK)
 * 3. Public API Fallbacks (Sync)
 * 4. Google Veo (Gemini API - Last Resort)
 */

const axios = require('axios');

// API Tokens
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const FAL_AI_API_KEY = process.env.FAL_AI_API_KEY || process.env.FAL_KEY || '';
const VEO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const FAL_AI_ENDPOINTS = [
    { name: 'Wan v2.7', url: 'https://fal.run/fal-ai/wan/v2.7/text-to-video' },
    { name: 'Wan v2.2-a14b', url: 'https://fal.run/fal-ai/wan/v2.2-a14b/text-to-video' }
];

module.exports = {
    name: 'aiartvideo',
    aliases: ['artvideo', 'videogen', 'av'],
    description: 'Generate a high-quality AI art video from text',
    category: 'media',
    async execute({ sock, msg, from, reply, args }) {
        const prompt = args.join(' ');
        if (!prompt) {
            return reply('🎬 *SUKUNA AI VIDEO*\n\nPlease provide a prompt for the AI video.\nExample: .aiartvideo a futuristic city in the rain');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎬', key: msg.key } });
            await reply('⏳ *Generating your AI video...* This process uses multiple high-quality engines and may take 1-3 minutes.');

            let videoUrl = null;
            let videoBuffer = null; // used by stages (like Google Veo) whose result URI needs an auth header to fetch
            let usedModel = '';

            // --- STAGE 1: REPLICATE (User's Key) ---
            const replicateModels = [
                { name: 'Runway Gen-4.5', id: 'runwayml/gen-4.5' },
                { name: 'Happy Horse 1.1', id: 'alibaba/happyhorse-1.1' }
            ];

            for (const model of replicateModels) {
                try {
                    console.log(`[aiartvideo] Trying Replicate: ${model.name}`);
                    const res = await axios.post(
                        `https://api.replicate.com/v1/models/${model.id}/predictions`,
                        { input: { prompt, duration: 5, aspect_ratio: "1:1" } },
                        {
                            headers: {
                                'Authorization': `Token ${REPLICATE_API_TOKEN}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 15000
                        }
                    );

                    let prediction = res.data;
                    let pollAttempts = 0;
                    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && pollAttempts < 40) {
                        await new Promise(r => setTimeout(r, 5000));
                        const poll = await axios.get(prediction.urls.get, {
                            headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` }
                        });
                        prediction = poll.data;
                        pollAttempts++;
                    }

                    if (prediction.status === 'succeeded') {
                        videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
                        usedModel = `Replicate (${model.name})`;
                        break;
                    }
                } catch (e) {
                    console.error(`[aiartvideo] Replicate ${model.name} failed:`, e.message);
                }
            }

            // --- STAGE 2: PREXZY API (Async Polling) ---
            if (!videoUrl) {
                try {
                    console.log(`[aiartvideo] Trying Prexzy API...`);
                    const submitRes = await axios.get(`https://prexzyapis.com/ai/aiart-video?prompt=${encodeURIComponent(prompt)}&engine=wan2_2`, { timeout: 20000 });
                    const submitData = submitRes.data;

                    if (submitData.status && submitData.task_id) {
                        const taskId = submitData.task_id;
                        const deviceId = submitData.device_id;
                        let pollAttempts = 0;
                        
                        while (pollAttempts < 40) {
                            await new Promise(r => setTimeout(r, 5000));
                            const statusRes = await axios.get(`https://prexzyapis.com/ai/aiart-video-status?task_id=${taskId}&device_id=${deviceId}`, { timeout: 15000 });
                            const statusData = statusRes.data;

                            if (statusData.status && (statusData.state === 'completed' || statusData.video_url)) {
                                videoUrl = statusData.video_url;
                                usedModel = 'Prexzy (Wan 2.2)';
                                break;
                            } else if (statusData.state === 'failed') {
                                break;
                            }
                            pollAttempts++;
                        }
                    }
                } catch (e) {
                    console.error(`[aiartvideo] Prexzy API failed:`, e.message);
                }
            }

            // --- STAGE 2.5: FAL.AI (Dual Endpoints - IMMEDIATE FALLBACK) ---
            // Tries both Wan v2.7 and v2.2-a14b without wasting time if Replicate & Prexzy fail
            if (!videoUrl) {
                for (const endpoint of FAL_AI_ENDPOINTS) {
                    if (videoUrl) break; // Exit if we already got a video
                    
                    try {
                        console.log(`[aiartvideo] Trying FAL.AI (${endpoint.name})...`);
                        
                        // Submit request to FAL.AI
                        const falSubmitRes = await axios.post(
                            endpoint.url,
                            { 
                                prompt,
                                video_length: 5,
                                aspect_ratio: "1:1"
                            },
                            {
                                headers: {
                                    'Authorization': `Key ${FAL_AI_API_KEY}`,
                                    'Content-Type': 'application/json'
                                },
                                timeout: 20000
                            }
                        );

                        const falData = falSubmitRes.data;
                        
                        // Check if we got a direct URL or need to poll
                        if (falData.video && falData.video.url) {
                            videoUrl = falData.video.url;
                            usedModel = `FAL.AI (${endpoint.name})`;
                        } else if (falData.request_id) {
                            // Poll for completion if async
                            const requestId = falData.request_id;
                            let pollAttempts = 0;

                            while (pollAttempts < 40) {
                                await new Promise(r => setTimeout(r, 3000)); // Poll every 3 seconds
                                
                                try {
                                    const statusRes = await axios.get(
                                        `${endpoint.url}?request_id=${requestId}`,
                                        {
                                            headers: {
                                                'Authorization': `Key ${FAL_AI_API_KEY}`
                                            },
                                            timeout: 15000
                                        }
                                    );

                                    const statusData = statusRes.data;
                                    
                                    if (statusData.video && statusData.video.url) {
                                        videoUrl = statusData.video.url;
                                        usedModel = `FAL.AI (${endpoint.name})`;
                                        break;
                                    } else if (statusData.status === 'failed') {
                                        break;
                                    }
                                } catch (pollErr) {
                                    console.error(`[aiartvideo] FAL.AI (${endpoint.name}) polling error:`, pollErr.message);
                                }
                                
                                pollAttempts++;
                            }
                        }
                    } catch (e) {
                        console.error(`[aiartvideo] FAL.AI (${endpoint.name}) failed:`, e.response?.data?.error || e.message);
                    }
                }
            }

            // --- STAGE 3: PUBLIC API FALLBACKS (Sync) ---
            if (!videoUrl) {
                const syncFallbacks = [
                    { name: 'Maher AI', url: `https://api.maher-zubair.tech/ai/text2video?q=${encodeURIComponent(prompt)}` },
                    { name: 'Siputzx AI', url: `https://api.siputzx.my.id/api/ai/text2video?prompt=${encodeURIComponent(prompt)}` }
                ];

                for (const fallback of syncFallbacks) {
                    try {
                        console.log(`[aiartvideo] Trying Sync Fallback: ${fallback.name}`);
                        const res = await axios.get(fallback.url, { timeout: 45000 });
                        videoUrl = res.data.result || res.data.url || res.data.video;
                        if (videoUrl) {
                            usedModel = fallback.name;
                            break;
                        }
                    } catch (e) {
                        console.error(`[aiartvideo] Sync Fallback ${fallback.name} failed:`, e.message);
                    }
                }
            }

            // --- STAGE 4: GOOGLE VEO (Gemini API — fallback of last resort) ---
            // Kicks in only if Replicate, Prexzy, both FAL.AI endpoints, and the public fallbacks all failed.
            if (!videoUrl && !videoBuffer) {
                try {
                    console.log(`[aiartvideo] Trying Google Veo (Gemini API)...`);
                    const submitRes = await axios.post(
                        `${VEO_BASE_URL}/models/veo-3.1-fast-generate-preview:predictLongRunning`,
                        { instances: [{ prompt }] },
                        {
                            headers: {
                                'x-goog-api-key': GEMINI_API_KEY,
                                'Content-Type': 'application/json'
                            },
                            timeout: 20000
                        }
                    );

                    const operationName = submitRes.data?.name;
                    if (operationName) {
                        let statusData = null;
                        let pollAttempts = 0;

                        while (pollAttempts < 40) {
                            await new Promise(r => setTimeout(r, 5000));
                            const poll = await axios.get(`${VEO_BASE_URL}/${operationName}`, {
                                headers: { 'x-goog-api-key': GEMINI_API_KEY },
                                timeout: 15000
                            });
                            statusData = poll.data;
                            if (statusData.done) break;
                            pollAttempts++;
                        }

                        const veoVideoUri = statusData?.done
                            ? statusData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
                            : null;

                        if (veoVideoUri) {
                            // The URI needs the API key to fetch, so WhatsApp's servers can't pull it
                            // directly — download the bytes ourselves and send them as a buffer instead.
                            const videoRes = await axios.get(veoVideoUri, {
                                headers: { 'x-goog-api-key': GEMINI_API_KEY },
                                responseType: 'arraybuffer',
                                timeout: 60000
                            });
                            videoBuffer = Buffer.from(videoRes.data);
                            usedModel = 'Google Veo 3.1 (Fast)';
                        }
                    }
                } catch (e) {
                    console.error(`[aiartvideo] Google Veo failed:`, e.response?.data?.error?.message || e.message);
                }
            }

            // --- FINAL DELIVERY ---
            if (!videoUrl && !videoBuffer) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                return reply('❌ *ERROR:* All video generation engines (Replicate, Prexzy, FAL.AI, Public, and Google Veo) are currently unavailable.\n\nPossible reasons:\n1. Prompt violates safety filters.\n2. API limits reached.\n3. Servers are down.');
            }

            await sock.sendMessage(from, {
                video: videoBuffer ? videoBuffer : { url: videoUrl },
                mimetype: 'video/mp4',
                caption: `🎬 *AI ART VIDEO*\n\n📝 *Prompt:* ${prompt}\n🚀 *Engine:* ${usedModel}\n\n> Generated by SUKUNA MD`,
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (err) {
            console.error('[aiartvideo] Fatal:', err.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *FATAL ERROR:* The command encountered an unexpected error. Please try again later.');
        }
    }
};

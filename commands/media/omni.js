'use strict';

const axios = require('axios');
const sharp = require('sharp');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

/**
 * .omni — The Omniscience Protocol
 * A peak OSINT-style command that combines search, news, weather, and AI
 * to generate a high-tech dashboard image.
 */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function renderOmniDashboard({ query, news, weather, analysis, location }) {
    const W = 1000, H = 700;
    const accent = '#00ffcc'; // Cyberpunk Teal
    
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stop-color="#050505"/>
                <stop offset="100%"  stop-color="#0a1a1a"/>
            </linearGradient>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${accent}" stroke-opacity="0.05" stroke-width="1"/>
            </pattern>
        </defs>
        
        <!-- Background & Grid -->
        <rect width="${W}" height="${H}" fill="url(#bg)"/>
        <rect width="${W}" height="${H}" fill="url(#grid)"/>
        
        <!-- Main Frame -->
        <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="${accent}" stroke-opacity="0.3" stroke-width="2" rx="10"/>
        <path d="M 20 60 L ${W - 20} 60" stroke="${accent}" stroke-opacity="0.5" stroke-width="1"/>
        
        <!-- Header -->
        <text x="40" y="48" font-family="monospace" font-size="24" font-weight="bold" fill="${accent}" letter-spacing="2">OMNISCIENCE PROTOCOL // v1.0.4</text>
        <text x="${W - 40}" y="48" text-anchor="end" font-family="monospace" font-size="14" fill="${accent}" fill-opacity="0.7">STATUS: INTERCEPTING DATA...</text>
        
        <!-- Query Display -->
        <g transform="translate(40, 85)">
            <text font-family="monospace" font-size="14" fill="${accent}" fill-opacity="0.6">TARGET_IDENTITY:</text>
            <text y="35" font-family="monospace" font-size="32" font-weight="bold" fill="#ffffff">${esc(query.toUpperCase())}</text>
        </g>
        
        <!-- Weather & Location (Physical Context) -->
        <g transform="translate(40, 160)">
            <rect width="280" height="120" rx="8" fill="#ffffff" fill-opacity="0.03" stroke="${accent}" stroke-opacity="0.2"/>
            <text x="15" y="25" font-family="monospace" font-size="12" fill="${accent}" fill-opacity="0.6">PHYSICAL_ENVIRONMENT</text>
            <text x="15" y="55" font-family="monospace" font-size="18" fill="#ffffff">${esc(location || 'Global/Digital')}</text>
            <text x="15" y="85" font-family="monospace" font-size="24" font-weight="bold" fill="${accent}">${esc(weather || 'N/A')}</text>
        </g>
        
        <!-- News Feed (Digital Footprint) -->
        <g transform="translate(340, 160)">
            <rect width="620" height="240" rx="8" fill="#ffffff" fill-opacity="0.03" stroke="${accent}" stroke-opacity="0.2"/>
            <text x="15" y="25" font-family="monospace" font-size="12" fill="${accent}" fill-opacity="0.6">RECENT_DATA_BURSTS (NEWS)</text>
            ${news.map((item, i) => `
                <text x="15" y="${55 + i * 45}" font-family="monospace" font-size="14" fill="#ffffff" font-weight="bold">${esc(item.title.substring(0, 65))}...</text>
                <text x="15" y="${72 + i * 45}" font-family="monospace" font-size="11" fill="${accent}" fill-opacity="0.5">${esc(item.source)} | ${esc(item.time)}</text>
            `).join('')}
        </g>
        
        <!-- AI Analysis (Predictive Engine) -->
        <g transform="translate(40, 420)">
            <rect width="920" height="220" rx="8" fill="#ffffff" fill-opacity="0.03" stroke="${accent}" stroke-opacity="0.2"/>
            <text x="15" y="25" font-family="monospace" font-size="12" fill="${accent}" fill-opacity="0.6">PREDICTIVE_ANALYSIS_ENGINE</text>
            <foreignObject x="15" y="40" width="890" height="160">
                <div xmlns="http://www.w3.org/1999/xhtml" style="color: #ffffff; font-family: monospace; font-size: 14px; line-height: 1.6;">
                    ${esc(analysis)}
                </div>
            </foreignObject>
        </g>
        
        <!-- Footer Decorations -->
        <text x="40" y="${H - 35}" font-family="monospace" font-size="10" fill="${accent}" fill-opacity="0.4">DEEP_SCAN_COMPLETE // NO_REDACTION_FOUND // ENCRYPTED_STREAM_ESTABLISHED</text>
        <rect x="${W - 150}" y="${H - 45}" width="130" height="20" rx="4" fill="${accent}" fill-opacity="0.2"/>
        <text x="${W - 85}" y="${H - 31}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="${accent}">SECURE_LINK</text>
    </svg>`;

    return sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = {
    name: 'omni',
    alias: ['omniscience', 'deepscan', 'detective'],
    desc: 'The Omniscience Protocol — Deep Reality Interception',
    category: 'media',
    usage: '.omni <query>',

    execute: async ({ sock, msg, from, args, reply, prefix }) => {
        const query = args.join(' ');
        if (!query) return reply(`❌ *OMNISCIENCE PROTOCOL ERROR*\n\nPlease provide a target identity or query.\nExample: \`${prefix}omni Sukuna\``);

        await sock.sendMessage(from, { react: { text: '👁️', key: msg.key } });
        await reply('🌀 *Initializing Omniscience Protocol...*\n_Bypassing firewalls and intercepting global data streams._');

        try {
            // 1. Fetch News (Digital Footprint)
            const newsRes = await axios.get(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=4&apiKey=YOUR_NEWS_API_KEY`).catch(() => null);
            // Fallback news if API key is missing or fails
            const news = newsRes?.data?.articles?.map(a => ({
                title: a.title,
                source: a.source.name,
                time: new Date(a.publishedAt).toLocaleDateString()
            })) || [
                { title: `Global mentions of ${query} increasing in encrypted channels`, source: 'Nexus Intel', time: 'LIVE' },
                { title: `Speculation regarding ${query} reaches critical mass`, source: 'Shadow Net', time: '2h ago' },
                { title: `Unknown entities tracking ${query} signatures`, source: 'Void News', time: '5h ago' },
                { title: `Digital footprint for ${query} shows anomalous activity`, source: 'Signal Leak', time: '1d ago' }
            ];

            // 2. Fetch Weather/Location (Physical Context)
            const weatherRes = await axios.get(`https://api.weatherapi.com/v1/current.json?key=YOUR_WEATHER_API_KEY&q=${encodeURIComponent(query)}`).catch(() => null);
            const weather = weatherRes?.data ? `${weatherRes.data.current.temp_c}°C | ${weatherRes.data.current.condition.text}` : 'Atmospheric Anomaly';
            const location = weatherRes?.data ? `${weatherRes.data.location.name}, ${weatherRes.data.location.country}` : 'Global Digital Grid';

            // 3. AI Predictive Analysis (Mocking high-end analysis)
            const analysis = `Analysis of "${query}" indicates a high-probability convergence event. Data suggests that ${query} is currently a focal point in the digital zeitgeist. Predictive models show a 87.4% likelihood of increased volatility in related sectors. Recommendation: Maintain surveillance. The target shows signs of multidimensional influence. Digital traces are being obfuscated in real-time.`;

            // 4. Render the Dashboard
            const dashboardBuf = await renderOmniDashboard({ query, news, weather, analysis, location });

            // 5. Send with Buttons
            const buttons = [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({ display_text: '🔄 Re-Scan', id: `${prefix}omni ${query}` }),
                },
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({ display_text: '🌐 Nexus Portal', id: `${prefix}nexus` }),
                }
            ];

            const interactiveMessage = {
                body: { text: `👁️ *OMNISCIENCE REPORT: ${query.toUpperCase()}*\n\nDeep reality scan complete. All intercepted data has been compiled into the dashboard above.` },
                footer: { text: 'SUKUNA MD · Omniscience Protocol' },
                header: {
                    title: '✦ OMNI REPORT ✦',
                    hasMediaAttachment: true,
                    imageMessage: (await require('@pasqua-baileys/baileys').generateWAMessageContent({ image: dashboardBuf }, { upload: sock.waUploadToServer })).imageMessage
                },
                nativeFlowMessage: {
                    buttons,
                    messageParamsJson: '',
                },
            };

            const wrapped = generateWAMessageFromContent(
                from,
                {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                            interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactiveMessage),
                        },
                    },
                },
                { userJid: sock.user?.id, quoted: msg }
            );

            await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (err) {
            console.error(err);
            reply('❌ *PROTOCOL CRITICAL ERROR*\n\nThe Omniscience link was severed: ' + err.message);
        }
    }
};

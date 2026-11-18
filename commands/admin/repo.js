'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { generateWAMessageFromContent, prepareWAMessageMedia, proto } = require('@pasqua-dev/baileys');

const REPO_OWNER = 'pasquawisdom2007-beep';
const REPO_NAME = 'SUKUNA_MD';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
const CREATOR = 'PASQUA';
const PRIMARY_PAIR_URL = 'https://pair-site-wmte.onrender.com/';
const BACKUP_PAIR_URL = 'https://pair-site-91ob.onrender.com/';
const SUPPORT_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb912f9It5rxMNf1Sf2n';
const VIDEO_TUTORIAL_URL = 'https://youtube.com/shorts/LNGEx12xFeg';
const IMAGE_PATH = path.join(__dirname, '../../assets/repo/pasqua-repo.jpg');
const CHANNEL_JID = '120363424109748354@newsletter';
const CHANNEL_NAME = 'SUKUNA MD Pasqua Tech';

function githubRepoStats() {
    return new Promise((resolve, reject) => {
        const request = https.get(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
            headers: {
                'User-Agent': 'SUKUNA-MD-Repo-Command',
                Accept: 'application/vnd.github+json',
            },
        }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`GitHub API HTTP ${response.statusCode}`));
                    return;
                }
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    resolve({
                        stars: Number(data.stargazers_count) || 0,
                        forks: Number(data.forks_count) || 0,
                        watchers: Number(data.subscribers_count ?? data.watchers_count) || 0,
                        description: String(data.description || 'WhatsApp multi-device bot').trim(),
                        size: Number(data.size) || 0,
                        updatedAt: data.updated_at || null,
                    });
                } catch (error) {
                    reject(error);
                }
            });
            response.on('error', reject);
        });
        request.setTimeout(12000, () => request.destroy(new Error('GitHub API timeout')));
        request.on('error', reject);
    });
}

function number(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatSize(kb) {
    if (!kb) return '—';
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${number(kb)} KB`;
}

function formatUpdated(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
}

function homeCaption(stats, mention = 'there') {
    return [
        '╭━━━〔 𝙎𝙐𝙆𝙐𝙉𝘼 𝙈𝘿 〕━━━╮',
        '┃ 𝙋𝘼𝙎𝙌𝙐𝘼 𝙏𝙀𝘾𝙃 · 𝙍𝙀𝙋𝙊 𝙃𝙐𝘽',
        '┣━━━━━━━━━━━━━━━━━━━━',
        `┃ ✦ *Repository*  ${REPO_NAME}`,
        `┃ ✦ *Owner*       ${CREATOR}`,
        `┃ ✦ *Stars*       ${number(stats.stars)} ⭐`,
        `┃ ✦ *Forks*       ${number(stats.forks)} 🍴`,
        `┃ ✦ *Watchers*     ${number(stats.watchers)} 👁️`,
        `┃ ✦ *Size*         ${formatSize(stats.size)}`,
        `┃ ✦ *Updated*      ${formatUpdated(stats.updatedAt)}`,
        '┣━━━━━━━━━━━━━━━━━━━━',
        `┃ 🔗 *Repo:* ${REPO_URL}`,
        `┃ 🔑 *Pair 1:* ${PRIMARY_PAIR_URL}`,
        `┃ 🔑 *Pair 2:* ${BACKUP_PAIR_URL}`,
        '┣━━━━━━━━━━━━━━━━━━━━',
        `┃ Welcome, @${mention}. Choose a section below.`,
        '╰━━━〔 𝙋𝘼𝙎𝙌𝙐𝘼 〕━━━╯',
    ].join('\n');
}

function ownerPanel() {
    return [
        '╭━━━〔 👑 𝙊𝙒𝙉𝙀𝙍 〕━━━╮',
        '┃ *Name*          PASQUA',
        '┃ *Country*       Nigeria 🇳🇬',
        '┃ *Age*           19',
        '┃ *Status*        Taken 💍',
        '┃ *Speciality*    Node.js · WhatsApp MD',
        '┃                 AI systems · Web apps',
        '┣━━━━━━━━━━━━━━━━━━━━',
        '┃ Building sharp tools, clean systems,',
        '┃ and rich WhatsApp experiences.',
        '╰━━━〔 𝙋𝘼𝙎𝙌𝙐𝘼 𝙏𝙀𝘾𝙃 〕━━━╯',
    ].join('\n');
}

function deploymentPanel() {
    return [
        '╭━━━〔 🚀 𝘿𝙀𝙋𝙇𝙊𝙔𝙈𝙀𝙉𝙏 〕━━━╮',
        '┃ Deploy SUKUNA MD on Render,',
        '┃ Pterodactyl, VPS, or Heroku.',
        '┣━━━━━━━━━━━━━━━━━━━━',
        '┃ Choose *Written Tutorial* for the',
        '┃ full setup steps, or *Watch Video*',
        '┃ for the quick visual walkthrough.',
        '╰━━━━━━━━━━━━━━━━━━━━╯',
    ].join('\n');
}

function writtenTutorial() {
    return [
        '╭━━━〔 📘 𝙒𝙍𝙄𝙏𝙏𝙀𝙉 𝙂𝙐𝙄𝘿𝙀 〕━━━╮',
        '┃ 1. Clone or download the repository.',
        '┃ 2. Run: `npm install --omit=dev`',
        '┃ 3. Configure `PAIR_NUMBER` and',
        '┃    `OWNER_NUMBER` in your panel.',
        '┃ 4. Start with: `npm start`',
        '┃ 5. Enter the WhatsApp pairing code.',
        '┃ 6. Keep the `sessions/` folder persistent.',
        '┣━━━━━━━━━━━━━━━━━━━━',
        `┃ Repo: ${REPO_URL}`,
        '╰━━━〔 𝙎𝙐𝙆𝙐𝙉𝘼 𝙈𝘿 〕━━━╯',
    ].join('\n');
}

function pairPanel() {
    return [
        '╭━━━〔 🔑 𝙋𝘼𝙄𝙍 𝙎𝙄𝙏𝙀𝙎 〕━━━╮',
        '┃ Use either server to generate',
        '┃ your WhatsApp session details.',
        '┣━━━━━━━━━━━━━━━━━━━━',
        `┃ *Server 1:* ${PRIMARY_PAIR_URL}`,
        `┃ *Backup:*  ${BACKUP_PAIR_URL}`,
        '┣━━━━━━━━━━━━━━━━━━━━',
        '┃ Open a site, enter your number,',
        '┃ generate the session, then deploy.',
        '╰━━━〔 𝙋𝘼𝙎𝙌𝙐𝘼 𝙏𝙀𝘾𝙃 〕━━━╯',
    ].join('\n');
}

function supportCaption() {
    return [
        '╭━━━〔 📡 𝙎𝙐𝙋𝙋𝙊𝙍 〕━━━╮',
        '┃ Need updates, help, or new drops?',
        '┃ Join the official SUKUNA MD channel.',
        '┣━━━━━━━━━━━━━━━━━━━━',
        `┃ ${SUPPORT_CHANNEL_URL}`,
        '╰━━━〔 𝙎𝙐𝙆𝙐𝙉𝘼 𝙈𝘿 〕━━━╯',
    ].join('\n');
}

function singleSelect(title, sections) {
    return {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({ title, sections }),
    };
}

function ctaUrl(displayText, url) {
    return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text: displayText, url, merchant_url: url }),
    };
}

function menuButtons(view = 'home') {
    if (view === 'deployment') {
        return [singleSelect('DEPLOYMENT OPTIONS', [{
            title: 'Choose a tutorial',
            rows: [
                { title: 'Written Tutorial', description: 'Step-by-step deployment guide', id: 'repo:deploy_words' },
                { title: 'Watch Video', description: 'Quick visual deployment walkthrough', id: 'repo:deploy_video' },
            ],
        }])];
    }
    return [singleSelect('OPEN REPO HUB', [{
        title: 'SUKUNA MD INFORMATION',
        rows: [
            { title: 'Owner Information', description: 'Meet PASQUA · Nigeria · Tech specialist', id: 'repo:owner' },
            { title: 'Deployment Tutorial', description: 'Words or video walkthrough', id: 'repo:deployment' },
            { title: 'Pair Sites', description: 'Primary and backup pairing servers', id: 'repo:pairs' },
            { title: 'Support Channel', description: 'Official updates and support', id: 'repo:support' },
            { title: 'Repository Link', description: 'Open the public GitHub repository', id: 'repo:repo_link' },
        ],
    }]), ctaUrl('OPEN REPOSITORY', REPO_URL), ctaUrl('PAIR SERVER 1', PRIMARY_PAIR_URL), ctaUrl('PAIR SERVER 2', BACKUP_PAIR_URL)];
}

async function sendInteractiveCard({ sock, msg, from, text, view = 'home', mentionJid }) {
    const image = fs.existsSync(IMAGE_PATH) ? fs.readFileSync(IMAGE_PATH) : null;
    if (!image || typeof sock.relayMessage !== 'function') throw new Error('Native interactive transport unavailable');
    const { imageMessage } = await prepareWAMessageMedia({ image }, { upload: sock.waUploadToServer });
    const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
        body: { text },
        header: {
            title: '𝙎𝙐𝙆𝙐𝙉𝘼 𝙈𝘿 · 𝙍𝙀𝙋𝙊 𝙃𝙐𝘽',
            subtitle: 'PASQUA TECH',
            hasMediaAttachment: true,
            imageMessage,
        },
        nativeFlowMessage: {
            buttons: menuButtons(view),
            messageParamsJson: '',
        },
    });
    const wrapped = generateWAMessageFromContent(from, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadataVersion: 2,
                    deviceListMetadata: {},
                },
                interactiveMessage,
            },
        },
    }, {
        userJid: sock.user?.id,
        quoted: msg,
        mentions: mentionJid ? [mentionJid] : [],
    });
    return sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
}

async function sendSupport({ sock, msg, from, reply }) {
    const caption = supportCaption();
    try {
        const image = fs.existsSync(IMAGE_PATH) ? fs.readFileSync(IMAGE_PATH) : null;
        if (!image) throw new Error('support image unavailable');
        return await sock.sendMessage(from, {
            image,
            caption,
            contextInfo: {
                isForwarded: true,
                forwardingScore: 999,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: CHANNEL_JID,
                    newsletterName: CHANNEL_NAME,
                    serverMessageId: 1,
                },
                externalAdReply: {
                    title: CHANNEL_NAME,
                    body: 'Tap to join the official support channel',
                    mediaType: 1,
                    sourceUrl: SUPPORT_CHANNEL_URL,
                    thumbnailUrl: SUPPORT_CHANNEL_URL,
                    renderLargerThumbnail: true,
                    showAdAttribution: false,
                },
            },
        }, { quoted: msg });
    } catch (error) {
        console.error('[repo] support preview failed:', error.message);
        return reply(caption);
    }
}

async function sendRepo({ sock, msg, from, sender, phoneNumber, reply, view = 'home' }) {
    if (view === 'deploy_words') return reply(writtenTutorial());
    if (view === 'deploy_video') {
        return sock.sendMessage(from, {
            text: `🎥 *SUKUNA MD Deployment Video*\n\nWatch the tutorial here:\n${VIDEO_TUTORIAL_URL}`,
            contextInfo: {
                externalAdReply: {
                    title: 'SUKUNA MD Deployment Tutorial',
                    body: 'Watch the quick setup walkthrough',
                    mediaType: 1,
                    sourceUrl: VIDEO_TUTORIAL_URL,
                    thumbnailUrl: VIDEO_TUTORIAL_URL,
                    renderLargerThumbnail: true,
                    showAdAttribution: false,
                },
            },
        }, { quoted: msg });
    }
    if (view === 'owner') return sendInteractiveCard({ sock, msg, from, text: ownerPanel(), view: 'home' });
    if (view === 'deployment') return sendInteractiveCard({ sock, msg, from, text: deploymentPanel(), view: 'deployment' });
    if (view === 'pairs') return sendInteractiveCard({ sock, msg, from, text: pairPanel(), view: 'home' });
    if (view === 'support') return sendSupport({ sock, msg, from, reply });
    if (view === 'repo_link') return reply(`🔗 *SUKUNA MD Repository*\n\n${REPO_URL}`);

    let stats = { stars: 0, forks: 0, watchers: 0, size: 0, updatedAt: null, description: 'WhatsApp multi-device bot.' };
    try {
        stats = await githubRepoStats();
    } catch (error) {
        console.error('[repo] GitHub stats unavailable:', error.message);
    }
    const mentionJid = sender || from;
    const mentionNumber = String(phoneNumber || mentionJid || 'user').replace(/[^0-9]/g, '') || 'user';
    const text = homeCaption(stats, mentionNumber);
    try {
        return await sendInteractiveCard({ sock, msg, from, text, mentionJid });
    } catch (error) {
        console.error('[repo] native card failed:', error.message);
        try {
            const image = fs.readFileSync(IMAGE_PATH);
            return await sock.sendMessage(from, {
                image,
                caption: `${text}\n\nUse the buttons/menu above when supported.`,
                mentions: mentionJid ? [mentionJid] : [],
            }, { quoted: msg });
        } catch (fallbackError) {
            console.error('[repo] image fallback failed:', fallbackError.message);
            return reply(text);
        }
    }
}

module.exports = {
    name: 'repo',
    aliases: ['repository', 'source', 'github'],
    description: 'Open the sleek interactive SUKUNA MD repository hub',
    category: 'admin',
    execute: sendRepo,
    __test: {
        homeCaption,
        ownerPanel,
        deploymentPanel,
        writtenTutorial,
        pairPanel,
        supportCaption,
        menuButtons,
        githubRepoStats,
        REPO_URL,
        PRIMARY_PAIR_URL,
        BACKUP_PAIR_URL,
        SUPPORT_CHANNEL_URL,
        VIDEO_TUTORIAL_URL,
        IMAGE_PATH,
    },
};

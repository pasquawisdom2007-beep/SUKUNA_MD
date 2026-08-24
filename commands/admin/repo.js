'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_OWNER = 'pasquawisdom2007-beep';
const REPO_NAME = 'SUKUNA_MD';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
const CREATOR = 'PASQUA';
const IMAGE_PATH = path.join(__dirname, '../../assets/repo/pasqua-repo.jpg');

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

function caption(stats) {
    return [
        '╭━━━〔 *SUKUNA MD · OFFICIAL REPOSITORY* 〕━━━╮',
        '│',
        '│  ⚔️ *PASQUA TECH*',
        '│  The official source code and latest bot updates',
        '│',
        '├─〔 *REPOSITORY* 〕',
        `│  🔗 ${REPO_URL}`,
        '│',
        '├─〔 *GITHUB COMMUNITY* 〕',
        `│  ⭐ Stars     │ ${number(stats.stars)}`,
        `│  🍴 Forks     │ ${number(stats.forks)}`,
        `│  👁️ Watchers  │ ${number(stats.watchers)}`,
        '│',
        '├─〔 *CREATOR* 〕',
        `│  👑 ${CREATOR}`,
        '│',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        '⭐ Star the repository and follow the project to support future updates.',
        '_Live GitHub statistics · Main repository_',
    ].join('\n');
}

async function sendRepo({ sock, msg, from, reply }) {
    let stats = { stars: 0, forks: 0, watchers: 0 };
    try {
        stats = await githubRepoStats();
    } catch (error) {
        console.error('[repo] GitHub stats unavailable:', error.message);
    }

    const text = caption(stats);
    try {
        const image = fs.readFileSync(IMAGE_PATH);
        return await sock.sendMessage(from, {
            image,
            caption: text,
        }, { quoted: msg });
    } catch (error) {
        console.error('[repo] image response failed:', error.message);
        return reply(text);
    }
}

module.exports = {
    name: 'repo',
    aliases: ['repository', 'source', 'github'],
    description: 'Show the official GitHub repository, live stats, creator, and PASQUA artwork',
    category: 'admin',
    execute: sendRepo,
    __test: { caption, githubRepoStats, REPO_URL, CREATOR, IMAGE_PATH },
};

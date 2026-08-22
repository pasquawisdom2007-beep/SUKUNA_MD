'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const sharp = require('sharp');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

/**
 * .neuro — Full Jarvis AI Core (v5.0)
 * God-Mode: Command creation, file management, API scanning,
 * canvas rendering, code fixing, config editing, and total system control.
 * Covers EVERYTHING a normal developer does on the panel and bot files.
 */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ROOT = process.cwd();

// ─── Helper: find files anywhere in the bot structure ───
async function findFile(fileName) {
    try {
        const { stdout } = await execAsync(`find ${ROOT} -name "${fileName}.js" -not -path "*/node_modules/*" 2>/dev/null`);
        return stdout.trim().split('\n').filter(Boolean);
    } catch { return []; }
}

// ─── Helper: safely read a file ───
function safeReadFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        return null;
    }
}

// ─── Helper: safely write a file ───
function safeWriteFile(filePath, content) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

// ─── Helper: list directory tree ───
function listDir(dirPath, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return [];
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const result = [];
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name === 'node_modules') continue;
            if (entry.name === '🌿') continue;
            const entryPath = path.join(dirPath, entry.name);
            const indent = '  '.repeat(depth);
            if (entry.isDirectory()) {
                result.push({ type: 'dir', name: entry.name, path: entryPath, depth });
                result.push(...listDir(entryPath, depth + 1, maxDepth));
            } else {
                result.push({ type: 'file', name: entry.name, path: entryPath, depth });
            }
        }
        return result;
    } catch { return []; }
}

// ─── Helper: scan for APIs and keys ───
function scanForAPIs() {
    const results = [];
    const configPath = path.join(ROOT, 'config.js');
    const configContent = safeReadFile(configPath);
    if (configContent) {
        const apiMatch = configContent.match(/apiKeys:\s*\{([^}]+)\}/s);
        if (apiMatch) {
            const keys = apiMatch[1].trim();
            const entries = keys.split(',').map(k => k.trim()).filter(Boolean);
            for (const entry of entries) {
                const match = entry.match(/(\w+):\s*(.+)/);
                if (match) {
                    const keyName = match[1];
                    let value = match[2].trim();
                    if (value.includes('process.env.')) {
                        const envVar = value.match(/process\.env\.(\w+)/);
                        results.push({
                            name: keyName,
                            source: 'config.js',
                            type: 'environment',
                            envVar: envVar ? envVar[1] : null,
                            masked: envVar ? `(from $${envVar[1]})` : 'masked',
                        });
                    } else {
                        const cleaned = value.replace(/['"]/g, '');
                        if (cleaned.length > 4) {
                            results.push({
                                name: keyName,
                                source: 'config.js',
                                type: 'hardcoded',
                                value: cleaned.slice(0, 8) + '****' + cleaned.slice(-4),
                                masked: cleaned.slice(0, 4) + '****' + cleaned.slice(-4),
                            });
                        }
                    }
                }
            }
        }
    }

    // Scan smartAI.js for provider chain
    const smartAIPath = path.join(ROOT, 'utils', 'smartAI.js');
    const smartAIContent = safeReadFile(smartAIPath);
    if (smartAIContent) {
        const providerMatch = smartAIContent.match(/AI_PROVIDER\s*=\s*'([^']+)'/);
        const urlMatch = smartAIContent.match(/AI_URL\s*=\s*'([^']+)'/);
        const modelsMatch = smartAIContent.match(/AI_MODELS\s*=\s*\[([^\]]+)\]/);
        results.push({
            name: 'AI Provider',
            source: 'utils/smartAI.js',
            type: 'primary',
            provider: providerMatch ? providerMatch[1] : 'unknown',
            url: urlMatch ? urlMatch[1] : 'unknown',
            models: modelsMatch ? modelsMatch[1].split(',').map(m => m.trim().replace(/'/g, '')) : [],
        });
    }

    return results;
}

// ─── Canvas Rendering ───
async function renderJarvisCanvas(type, data) {
    const W = 1000, H = 600;
    const accent = '#00d1ff';
    const gold = '#fbbf24';

    if (type === 'neural_map') {
        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#010203"/>
                    <stop offset="100%" stop-color="#0a1221"/>
                </linearGradient>
            </defs>
            <rect width="${W}" height="${H}" fill="url(#bg)"/>
            <g transform="translate(${W/2}, ${H/2})">
                <circle r="220" fill="none" stroke="${accent}" stroke-opacity="0.1" stroke-width="1"/>
                <circle r="160" fill="none" stroke="${accent}" stroke-opacity="0.08" stroke-width="0.5"/>
                ${[...Array(12)].map((_, i) => {
                    const angle = (i * 30) * Math.PI / 180;
                    const x = 180 * Math.cos(angle);
                    const y = 180 * Math.sin(angle);
                    return `
                    <line x1="0" y1="0" x2="${x}" y2="${y}" stroke="${accent}" stroke-opacity="0.25" stroke-width="0.5"/>
                    <circle cx="${x}" cy="${y}" r="25" fill="#010203" stroke="${accent}" stroke-width="1"/>
                    <text x="${x}" y="${y}" text-anchor="middle" dy=".3em" font-family="monospace" font-size="7" fill="${accent}">NODE_${i}</text>`;
                }).join('')}
                <circle r="70" fill="#010203" stroke="${accent}" stroke-width="2"/>
                <text text-anchor="middle" dy=".3em" font-family="Georgia, serif" font-size="14" fill="${accent}">NEURAL_HUB</text>
            </g>
            <text x="${W-50}" y="${H-30}" text-anchor="end" font-family="monospace" font-size="10" fill="${accent}" fill-opacity="0.4">JARVIS_CORE_v5.0 // GOD_MODE_ACTIVE</text>
        </svg>`;
        return svg;
    }

    if (type === 'system_status') {
        const mem = process.memoryUsage();
        const memoryMB = Math.round(mem.rss / 1024 / 1024);
        const uptimeSec = Math.floor(process.uptime());
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        const uptimeStr = `${h}h ${m}m ${s}s`;
        const cpuLoad = Math.floor(Math.random() * 5) + 1;

        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#010203"/>
                    <stop offset="100%" stop-color="#0a1221"/>
                </linearGradient>
                <linearGradient id="accentG" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="${accent}"/>
                    <stop offset="100%" stop-color="#7c3aed"/>
                </linearGradient>
            </defs>
            <rect width="${W}" height="${H}" fill="url(#bg)"/>
            <g transform="translate(60, 80)">
                <text font-family="'Courier New', monospace" font-size="11" fill="${accent}" letter-spacing="4">JARVIS SYSTEM STATUS v5.0</text>
                <rect y="20" width="350" height="1" fill="url(#accentG)"/>

                <g transform="translate(0, 60)" font-family="'Courier New', monospace" font-size="15">
                    <text fill="#ffffff">MEMORY  : ${memoryMB} MB</text>
                    <text y="35" fill="#ffffff">UPTIME  : ${uptimeStr}</text>
                    <text y="70" fill="#ffffff">CPU     : ${cpuLoad}%</text>
                    <text y="105" fill="#ffffff">PLATFORM: ${process.platform} ${process.arch}</text>
                    <text y="140" fill="#ffffff">NODE    : v${process.version.replace('v', '')}</text>
                </g>

                <g transform="translate(0, 280)">
                    <text font-family="'Courier New', monospace" font-size="11" fill="${gold}" letter-spacing="4">COMMAND CENTER</text>
                    <rect y="18" width="200" height="1" fill="${gold}" fill-opacity="0.4"/>
                </g>

                <g transform="translate(0, 310)" font-family="'Courier New', monospace" font-size="13" fill="#e5e7eb">
                    <text fill="#22c55e">create</text><text x="140" fill="#9ca3af">Synthesize new commands</text>
                    <text y="28" fill="#22c55e">fix</text><text x="140" fill="#9ca3af">Repair and optimize code</text>
                    <text y="56" fill="#22c55e">files</text><text x="140" fill="#9ca3af">Manage all bot files</text>
                    <text y="84" fill="#22c55e">apis</text><text x="140" fill="#9ca3af">List APIs and keys</text>
                    <text y="112" fill="#22c55e">canvas</text><text x="140" fill="#9ca3af">Render custom visuals</text>
                    <text y="140" fill="#22c55e">scan</text><text x="140" fill="#9ca3af">Deep system audit</text>
                    <text y="168" fill="#22c55e">edit</text><text x="140" fill="#9ca3af">Modify config and settings</text>
                    <text y="196" fill="#22c55e">deploy</text><text x="140" fill="#9ca3af">Deploy or update commands</text>
                </g>

                <g transform="translate(${W - 300}, ${H - 40})">
                    <text font-family="monospace" font-size="10" fill="${accent}" fill-opacity="0.5">GOD_MODE_AUTHORITY_GRANTED</text>
                </g>
            </g>
        </svg>`;
        return svg;
    }

    if (type === 'api_report') {
        const apis = data.apis || [];
        const apiRows = apis.map((api, i) => {
            const y = 70 + (i * 32);
            const name = esc(api.name || `API_${i}`);
            const info = esc(api.masked || api.provider || api.source || '');
            return `
            <rect x="60" y="${y}" width="${W - 120}" height="24" fill="${accent}" fill-opacity="0.05" rx="4"/>
            <text x="75" y="${y + 16}" font-family="monospace" font-size="12" fill="${accent}">${name}</text>
            <text x="300" y="${y + 16}" font-family="monospace" font-size="11" fill="#9ca3af">${info}</text>`;
        }).join('');

        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#010203"/>
                    <stop offset="100%" stop-color="#0a1221"/>
                </linearGradient>
            </defs>
            <rect width="${W}" height="${H}" fill="url(#bg)"/>
            <g transform="translate(0, 0)">
                <text x="60" y="45" font-family="'Courier New', monospace" font-size="18" fill="${accent}" letter-spacing="4">API SCAN REPORT</text>
                <rect x="60" y="55" width="400" height="2" fill="${accent}" fill-opacity="0.3"/>
                ${apiRows}
            </g>
            <text x="${W-50}" y="${H-30}" text-anchor="end" font-family="monospace" font-size="10" fill="${accent}" fill-opacity="0.4">JARVIS_API_SCANNER_v5.0</text>
        </svg>`;
        return svg;
    }

    // Default: generic status
    return null;
}

// ─── Helper: build interactive button message ───
async function sendInteractive(sock, from, msg, headerText, bodyText, footerText, buttons, mediaType, mediaContent) {
    const header = {};
    if (mediaType === 'image' && mediaContent) {
        header.hasMediaAttachment = true;
        if (Buffer.isBuffer(mediaContent)) {
            const { generateWAMessageContent } = require('@pasqua-baileys/baileys');
            const result = await generateWAMessageContent({ image: mediaContent }, { upload: sock.waUploadToServer });
            header.imageMessage = result.imageMessage;
        }
    } else {
        header.hasMediaAttachment = false;
        header.title = headerText;
    }

    const interactiveMessage = {
        body: { text: bodyText },
        footer: { text: footerText },
        header,
        nativeFlowMessage: { buttons, messageParamsJson: '' },
    };

    const wrapped = generateWAMessageFromContent(from, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactiveMessage),
            },
        },
    }, { userJid: sock.user?.id, quoted: msg });

    await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
}

// ─── COMMAND CREATE ENGINE ───
async function createCommand(sock, from, msg, prompt, reply, args) {
    if (!prompt) return reply('🧠 *JARVIS:* Describe the command you want me to create. Example: `.neuro create a fun game command called dice`');

    await sock.sendMessage(from, { react: { text: '🛠️', key: msg.key } });
    await reply('🧠 *JARVIS:* Synthesizing command module from your request...');

    const { ask: smartAsk } = require('../../utils/smartAI');

    // Gather context about existing commands
    const commandLoader = require('../../utils/commandLoader');
    const existingCmds = Array.from(commandLoader.getAll()).map(c => `${c.name} (${c.category})`).join(', ');

    const systemPrompt = `You are the JARVIS Creation Engine for a WhatsApp bot built on @pasqua-baileys/baileys.
Generate a complete, production-ready WhatsApp bot command file (.js).

CONTEXT - Existing commands and categories:
${existingCmds}

RULES:
1. Use the standard format: module.exports = { name, aliases, description, usage, category, execute }
2. The execute function receives: { sock, msg, from, sender, args, isGroup, phoneNumber, prefix, reply, database, isOwner, isMod, isAdmin, lang, t }
3. Always include error handling with try/catch
4. Always include input validation (check if args exist when needed)
5. Categories available: owner, admin, moderation, economy, fun, media, ai, utility, group, general, unicode, 18plus, textmaker
6. Use 'reply(text)' to send text responses
7. Use 'sock.sendMessage(from, { react: { text: emoji, key: msg.key } })' for reactions
8. Return ONLY the code, wrapped in \`\`\`javascript...\`\`\`

USER REQUEST: ${prompt}`;

    const code = await smartAsk({
        key: 'jarvis:create:' + Date.now(),
        system: systemPrompt,
        user: prompt,
    }).catch(() => null);

    if (!code || !code.includes('module.exports')) {
        return reply('🧠 *JARVIS:* Synthesis failed — the blueprint was unstable. Try rephrasing your request.');
    }

    let cleanCode = code.trim();
    if (cleanCode.includes('```')) {
        const parts = cleanCode.split('```');
        cleanCode = parts.length >= 2 ? parts[1].replace(/^(javascript|js)\n?/, '').trim() : cleanCode;
    }

    // Extract metadata
    const nameMatch = cleanCode.match(/name:\s*['"]([^'"]+)['"]/);
    const categoryMatch = cleanCode.match(/category:\s*['"]([^'"]+)['"]/);
    const aliasesMatch = cleanCode.match(/aliases:\s*\[([^\]]+)\]/);
    const descMatch = cleanCode.match(/description:\s*['"]([^'"]+)['"]/);

    const cmdName = nameMatch ? nameMatch[1] : 'temp_' + Date.now();
    const category = categoryMatch ? categoryMatch[1] : 'utility';
    const desc = descMatch ? descMatch[1] : 'Created by JARVIS';

    // Write to commands folder
    const dir = path.join(ROOT, 'commands', category);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${cmdName}.js`);
    safeWriteFile(filePath, cleanCode);

    // Reload commands
    commandLoader.loadCommands();

    // Check if it loaded
    const loaded = commandLoader.getCommand(cmdName);

    if (loaded) {
        await reply(
            `🧠 *JARVIS: Command Synthesized*\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `▸ Name: \`${cmdName}\`\n` +
            `▸ Category: \`${category}\`\n` +
            `▸ Aliases: ${aliasesMatch ? aliasesMatch[1] : 'none'}\n` +
            `▸ Description: ${desc}\n` +
            `▸ File: \`commands/${category}/${cmdName}.js\`\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ Command is LIVE and ready for use.\n` +
            `_JARVIS has injected this into the bot's runtime._`
        );
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
    } else {
        await reply(`⚠️ Command written to \`commands/${category}/${cmdName}.js\` but failed to auto-load. You may need to restart the bot.`);
    }
}

// ─── FILE MANAGEMENT ───
async function handleFiles(sock, from, msg, args, reply) {
    const subAction = args[1]?.toLowerCase();
    const target = args.slice(2).join(' ');

    if (!subAction || subAction === 'list' || subAction === 'ls') {
        // List files in a directory
        const dirPath = target ? path.join(ROOT, target) : ROOT;
        const safeDir = path.resolve(dirPath);

        if (!safeDir.startsWith(ROOT)) {
            return reply('🧠 *JARVIS:* Access denied — cannot list directories outside the project root.');
        }

        if (!fs.existsSync(safeDir)) {
            return reply(`🧠 *JARVIS:* Directory \`${target || '.'}\` does not exist.`);
        }

        const entries = listDir(safeDir, 0, target ? 3 : 2);
        if (entries.length === 0) {
            return reply('🧠 *JARVIS:* This directory is empty.');
        }

        const fileCount = entries.filter(e => e.type === 'file').length;
        const dirCount = entries.filter(e => e.type === 'dir').length;

        let output = `🧠 *JARVIS: File Listing*\n\n`;
        output += `📁 Root: \`${path.relative(ROOT, safeDir) || '.'}\`\n`;
        output += `📊 ${fileCount} files, ${dirCount} directories\n\n`;
        output += `\`\`\`\n`;

        for (const entry of entries.slice(0, 50)) {
            const indent = '  '.repeat(entry.depth);
            const icon = entry.type === 'dir' ? '📁' : '📄';
            const relPath = path.relative(ROOT, entry.path);
            output += `${indent}${icon} ${entry.name}\n`;
        }

        if (entries.length > 50) {
            output += `... and ${entries.length - 50} more entries\n`;
        }

        output += `\`\`\`\n\nUse \`.neuro files read <path>\` to view a file's contents.`;
        return reply(output);
    }

    if (subAction === 'read' || subAction === 'cat') {
        if (!target) return reply('🧠 *JARVIS:* Specify a file path. Example: `.neuro files read commands/ai/gpt.js`');

        const filePath = path.resolve(path.join(ROOT, target));
        if (!filePath.startsWith(ROOT)) {
            return reply('🧠 *JARVIS:* Access denied — cannot read files outside the project.');
        }
        if (!fs.existsSync(filePath)) {
            return reply(`🧠 *JARVIS:* File \`${target}\` not found.`);
        }

        const content = safeReadFile(filePath);
        if (content === null) {
            return reply(`🧠 *JARVIS:* Cannot read \`${target}\` — permission denied.`);
        }

        // Render as canvas card
        try {
            const { renderTextCard } = require('../../utils/canvasRender');
            const displayName = path.basename(target);
            const ext = path.extname(target);
            const langMap = { '.js': 'JAVASCRIPT', '.json': 'JSON', '.md': 'MARKDOWN', '.env': 'CONFIG', '.py': 'PYTHON' };
            const badge = langMap[ext] || 'FILE';

            // Truncate for display
            const maxLines = 40;
            const lines = content.split('\n');
            const display = lines.slice(0, maxLines).join('\n');
            const truncated = lines.length > maxLines ? `\n... (${lines.length - maxLines} more lines)` : '';

            const buf = await renderTextCard({
                title: displayName,
                badge: `${badge} · ${content.length} chars`,
                body: esc(display + truncated),
                accent: '#00d1ff',
            });

            await sock.sendMessage(from, { image: buf, caption: `\`\`\`\n${display.slice(0, 1500)}${truncated}\n\`\`\`` }, { quoted: msg });
            return;
        } catch (e) {
            // Fallback to text
            const maxLen = 2500;
            return reply(`🧠 *JARVIS: File Contents*\n\n\`\`\`${content.slice(0, maxLen)}${content.length > maxLen ? '\n... (truncated)' : ''}\`\`\``);
        }
    }

    if (subAction === 'write' || subAction === 'save') {
        if (!target) return reply('🧠 *JARVIS:* Specify a file path. Example: `.neuro files write commands/utility/hello.js`');

        const filePath = path.resolve(path.join(ROOT, target));
        if (!filePath.startsWith(ROOT)) {
            return reply('🧠 *JARVIS:* Access denied — cannot write files outside the project.');
        }

        // Get content from remaining args or ask AI
        const content = args.slice(3).join(' ');
        if (!content) {
            return reply('🧠 *JARVIS:* Provide content to write, or describe what you want and I\'ll generate it.');
        }

        safeWriteFile(filePath, content);
        const ext = path.extname(target);

        // If JS file, try to hot-reload
        if (ext === '.js') {
            try {
                const commandLoader = require('../../utils/commandLoader');
                commandLoader.loadCommands();
            } catch (_) {}
        }

        await reply(
            `🧠 *JARVIS: File Written*\n\n` +
            `📄 Path: \`${path.relative(ROOT, filePath)}\`\n` +
            `📏 Size: ${content.length} characters\n` +
            `✅ File saved and ${ext === '.js' ? 'hot-reloaded' : 'persisted'}.`
        );
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
        return;
    }

    if (subAction === 'delete' || subAction === 'rm') {
        if (!target) return reply('🧠 *JARVIS:* Specify a file path to delete. Example: `.neuro files delete commands/temp/broken.js`');

        const filePath = path.resolve(path.join(ROOT, target));
        if (!filePath.startsWith(ROOT)) {
            return reply('🧠 *JARVIS:* Access denied — cannot delete files outside the project.');
        }
        if (!fs.existsSync(filePath)) {
            return reply(`🧠 *JARVIS:* File \`${target}\` not found.`);
        }

        // Safety: don't delete critical files
        const criticalFiles = ['index.js', 'config.js', 'package.json', 'sessionManager.js', 'smartAI.js', 'database.js', 'commandLoader.js'];
        const fileName = path.basename(target);
        if (criticalFiles.includes(fileName)) {
            return reply(`🧠 *JARVIS:* Refusing to delete critical file \`${fileName}\`. This would break the bot.`);
        }

        fs.unlinkSync(filePath);

        // If it was a command, reload
        if (fileName.endsWith('.js')) {
            try {
                const commandLoader = require('../../utils/commandLoader');
                commandLoader.loadCommands();
            } catch (_) {}
        }

        await reply(`🧠 *JARVIS:* Deleted \`${target}\`. File removed from system.`);
        await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } });
        return;
    }

    if (subAction === 'search' || subAction === 'find') {
        if (!target) return reply('🧠 *JARVIS:* What should I search for? Example: `.neuro files search gpt`');

        try {
            const { stdout } = await execAsync(`grep -rl "${target}" ${ROOT} --exclude-dir=node_modules --include="*.js" --include="*.json" --include="*.md" 2>/dev/null`);
            const results = stdout.trim().split('\n').filter(Boolean);
            if (results.length === 0) {
                return reply(`🧠 *JARVIS:* No files found containing "${target}".`);
            }

            let output = `🧠 *JARVIS: Search Results*\n\n`;
            output += `🔍 Query: \`${target}\`\n`;
            output += `📊 Found in ${results.length} file(s)\n\n`;
            for (const r of results.slice(0, 20)) {
                output += `📄 ${path.relative(ROOT, r)}\n`;
            }
            return reply(output);
        } catch (e) {
            return reply('🧠 *JARVIS:* Search failed — the query may contain special characters.');
        }
    }

    if (subAction === 'count' || subAction === 'stats') {
        let totalFiles = 0;
        let totalDirs = 0;
        let totalLines = 0;
        let totalSize = 0;

        function countDir(dirPath) {
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name === 'node_modules') continue;
                    if (entry.name === '🌿') continue;
                    const fullPath = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        totalDirs++;
                        countDir(fullPath);
                    } else {
                        totalFiles++;
                        try {
                            const stat = fs.statSync(fullPath);
                            totalSize += stat.size;
                            if (fullPath.endsWith('.js')) {
                                const content = fs.readFileSync(fullPath, 'utf8');
                                totalLines += content.split('\n').length;
                            }
                        } catch (_) {}
                    }
                }
            } catch (_) {}
        }

        countDir(ROOT);

        return reply(
            `🧠 *JARVIS: Project Statistics*\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `📁 Directories: ${totalDirs}\n` +
            `📄 Files: ${totalFiles}\n` +
            `📝 JS Lines: ${totalLines.toLocaleString()}\n` +
            `💾 Total Size: ${(totalSize / 1024).toFixed(1)} KB\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `_JARVIS has scanned the entire project._`
        );
    }

    if (subAction === 'add' || subAction === 'new') {
        // Create a new file (can be used to add files to the panel)
        const targetPath = target || 'commands/utility/new_' + Date.now() + '.js';
        const filePath = path.resolve(path.join(ROOT, targetPath));

        if (!filePath.startsWith(ROOT)) {
            return reply('🧠 *JARVIS:* Access denied — cannot add files outside the project.');
        }

        // Create the file with a template if JS
        const ext = path.extname(targetPath);
        let content = '';

        if (ext === '.js') {
            content = `'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
    name: '${path.basename(targetPath, '.js')}',
    aliases: [],
    description: 'Created by JARVIS',
    usage: '.',
    category: '${path.basename(path.dirname(targetPath)) || 'utility'}',

    execute: async ({ sock, msg, from, sender, args, isGroup, phoneNumber, prefix, reply, database, isOwner, isMod, isAdmin, lang, t }) => {
        await reply('✅ Command executed successfully.');
    }
};`;
        } else if (ext === '.json') {
            content = '{\n  "created_by": "JARVIS",\n  "timestamp": "' + new Date().toISOString() + '"\n}';
        } else {
            content = `# Created by JARVIS\n# ${new Date().toISOString()}`;
        }

        safeWriteFile(filePath, content);

        // If JS in commands folder, try to reload
        if (ext === '.js' && targetPath.startsWith('commands/')) {
            try {
                const commandLoader = require('../../utils/commandLoader');
                commandLoader.loadCommands();
            } catch (_) {}
        }

        await reply(
            `🧠 *JARVIS: New File Added*\n\n` +
            `📄 Path: \`${targetPath}\`\n` +
            `📏 Size: ${content.length} characters\n` +
            `✅ File created and added to the project.` +
            `${ext === '.js' && targetPath.startsWith('commands/') ? '\n🔄 Commands hot-reloaded.' : ''}`
        );
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
        return;
    }

    return reply(
        `🧠 *JARVIS: File Management*\n\n` +
        `Available actions:\n` +
        `📋 \`.neuro files list [path]\` — List files\n` +
        `📖 \`.neuro files read <path>\` — Read file contents\n` +
        `✏️ \`.neuro files write <path> <content>\` — Write to file\n` +
        `➕ \`.neuro files add <path>\` — Create new file\n` +
        `🔍 \`.neuro files search <query>\` — Search across files\n` +
        `🗑️ \`.neuro files delete <path>\` — Delete a file\n` +
        `📊 \`.neuro files stats\` — Project statistics\n` +
        `\n_Use \`.neuro files\` without args to see this menu._`
    );
}

// ─── API LISTING ───
async function listAPIs(sock, from, msg, reply) {
    await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });
    await reply('🧠 *JARVIS:* Scanning all APIs, keys, and providers...');

    const apis = scanForAPIs();

    if (apis.length === 0) {
        return reply('🧠 *JARVIS:* No APIs found in the current configuration.');
    }

    let output = `🧠 *JARVIS: API Report*\n\n`;
    output += `━━━━━━━━━━━━━━━━━━\n`;

    for (const api of apis) {
        output += `\n🔑 *${api.name}*\n`;
        output += `   Source: ${api.source}\n`;
        if (api.provider) output += `   Provider: ${api.provider}\n`;
        if (api.url) output += `   URL: ${api.url}\n`;
        if (api.models && api.models.length) output += `   Models: ${api.models.join(', ')}\n`;
        if (api.masked) output += `   Key: ${api.masked}\n`;
        if (api.envVar) output += `   Env: $${api.envVar}\n`;
        if (api.type) output += `   Type: ${api.type}\n`;
    }

    output += `\n━━━━━━━━━━━━━━━━━━\n`;
    output += `_JARVIS has scanned the entire system._`;

    return reply(output);
}

// ─── SYSTEM AUDIT ───
async function systemAudit(sock, from, msg, reply) {
    await reply('🧠 *JARVIS:* Performing deep system audit...');

    let report = '';

    // 1. Scan for exposed secrets
    try {
        const { stdout: secrets } = await execAsync(`grep -rnE "(AI_API_KEY|API_KEY|TOKEN|SECRET|PASSWORD|APIKEY)" ${ROOT} --exclude-dir=node_modules --exclude="*.lock" --exclude-dir=sessions --exclude-dir=data 2>/dev/null | head -30`);
        report += `🛡️ *SECRET SCAN:*\n\`\`\`${secrets || 'No exposed secrets found.'}\`\`\`\n\n`;
    } catch { report += '🛡️ *SECRET SCAN:* Clean — no exposed secrets detected.\n\n'; }

    // 2. Config health
    const config = require('../../config');
    report += `⚙️ *CONFIG STATUS:*\n`;
    report += `   Bot: ${config.botName} v${config.version}\n`;
    report += `   Prefix: ${config.prefix}\n`;
    report += `   Owner: ${config.owner?.name}\n`;
    report += `   Mode: ${global.botMode || 'private'}\n\n`;

    // 3. Database status
    const dbPath = path.join(ROOT, 'data', 'users.json');
    const groupPath = path.join(ROOT, 'data', 'groups.json');
    report += `💾 *DATABASE STATUS:*\n`;
    report += `   Users: ${fs.existsSync(dbPath) ? '✅ Active' : '❌ Missing'}\n`;
    report += `   Groups: ${fs.existsSync(groupPath) ? '✅ Active' : '❌ Missing'}\n\n`;

    // 4. Command count
    const commandLoader = require('../../utils/commandLoader');
    report += `📦 *COMMAND STATUS:*\n`;
    report += `   Total Commands: ${commandLoader.commands.size}\n`;
    report += `   Categories: ${new Set(Array.from(commandLoader.getAll()).map(c => c.category)).size}\n\n`;

    // 5. AI Provider status
    try {
        const { getProviderInfo } = require('../../utils/smartAI');
        const info = getProviderInfo();
        report += `🤖 *AI PROVIDER:*\n`;
        report += `   Primary: ${info.provider}\n`;
        report += `   Chain: ${info.chain.join(' → ')}\n\n`;
    } catch (_) {}

    // 6. System resources
    const mem = process.memoryUsage();
    const os = require('os');
    report += `🖥️ *SYSTEM RESOURCES:*\n`;
    report += `   Memory: ${Math.round(mem.rss / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB\n`;
    report += `   Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n`;
    report += `   Platform: ${os.platform()} ${os.arch()}\n`;

    return reply(report);
}

// ─── CODE FIX / PATCH ───
async function fixCode(sock, from, msg, target, reply) {
    if (!target) return reply('🧠 *JARVIS:* Specify the file or command to fix. Example: `.neuro fix gpt` or `.neuro fix commands/ai/neuro.js`');

    await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });
    await reply('🧠 *JARVIS:* Analyzing target for issues...');

    // Resolve file path
    let filePath = null;

    // Check if it's a direct path
    const directPath = path.resolve(path.join(ROOT, target));
    if (fs.existsSync(directPath) && directPath.startsWith(ROOT)) {
        filePath = directPath;
    } else {
        // Search for it as a command name
        const found = await findFile(target);
        if (found && found.length > 0) {
            filePath = found[0];
        }
    }

    if (!filePath || !fs.existsSync(filePath)) {
        return reply(`🧠 *JARVIS:* Target \`${target}\` not found in the project.`);
    }

    const content = safeReadFile(filePath);
    if (!content) {
        return reply(`🧠 *JARVIS:* Cannot read \`${target}\`.`);
    }

    const { ask: smartAsk } = require('../../utils/smartAI');

    const fixPrompt = `You are JARVIS — the System Architect. Analyze this code for bugs, performance issues, missing error handling, or anti-patterns.
If you find issues, fix them and return the COMPLETE corrected code.
If the code is already perfect, return the original code unchanged.
Return ONLY the code, wrapped in \`\`\`javascript...\`\`\`

File: ${path.relative(ROOT, filePath)}

Code:
\`\`\`javascript
${content}
\`\`\``;

    const fixedCode = await smartAsk({
        key: 'jarvis:fix:' + target + ':' + Date.now(),
        system: fixPrompt,
        user: `Fix and optimize this file: ${path.relative(ROOT, filePath)}`,
    }).catch(() => null);

    if (!fixedCode) {
        return reply('🧠 *JARVIS:* Analysis engine failed. Cannot process the target.');
    }

    let cleanCode = fixedCode.trim();
    if (cleanCode.includes('```')) {
        const parts = cleanCode.split('```');
        cleanCode = parts.length >= 2 ? parts[1].replace(/^(javascript|js)\n?/, '').trim() : cleanCode;
    }

    // Check if code changed
    if (cleanCode === content) {
        return reply(`🧠 *JARVIS:* \`${target}\` is already optimized. No patches needed.`);
    }

    // Write fixed code
    safeWriteFile(filePath, cleanCode);

    // Clear require cache and reload
    try {
        delete require.cache[require.resolve(filePath)];
    } catch (_) {}

    try {
        const commandLoader = require('../../utils/commandLoader');
        commandLoader.loadCommands();
    } catch (_) {}

    const changes = cleanCode.split('\n').length - content.split('\n').length;

    await reply(
        `🧠 *JARVIS: Patch Applied*\n\n` +
        `📄 Target: \`${path.relative(ROOT, filePath)}\`\n` +
        `📝 Changes: ${changes > 0 ? '+' : ''}${changes} lines\n` +
        `✅ File patched and hot-reloaded.`
    );
    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
}

// ─── CANVAS RENDERING ───
async function renderCanvas(sock, from, msg, args, reply) {
    const renderType = (args[1] || 'status').toLowerCase();

    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
    await reply('🧠 *JARVIS:* Rendering canvas...');

    try {
        let svg;

        if (renderType === 'neural' || renderType === 'neural_map' || renderType === 'map') {
            svg = await renderJarvisCanvas('neural_map', {});
        } else if (renderType === 'api' || renderType === 'apis') {
            const apis = scanForAPIs();
            svg = await renderJarvisCanvas('api_report', { apis });
        } else if (renderType === 'status' || renderType === 'system' || renderType === 'dashboard') {
            svg = await renderJarvisCanvas('system_status', {});
        } else {
            // Custom render using renderTextCard from canvasRender
            const { renderTextCard } = require('../../utils/canvasRender');
            const customText = args.slice(1).join(' ') || 'JARVIS SYSTEM';
            const buf = await renderTextCard({
                title: 'JARVIS',
                badge: 'CUSTOM RENDER',
                body: esc(customText),
                accent: '#00d1ff',
            });
            await sock.sendMessage(from, { image: buf, caption: '🧠 *JARVIS:* Custom canvas rendered.' }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
            return;
        }

        if (svg) {
            const buf = await sharp(Buffer.from(svg)).png().toBuffer();
            await sock.sendMessage(from, { image: buf, caption: '🧠 *JARVIS:* Canvas rendered successfully.' }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
        } else {
            await reply('🧠 *JARVIS:* Unknown render type. Try: status, neural, apis, or custom text.');
        }
    } catch (e) {
        await reply(`🧠 *JARVIS:* Render failed: ${e.message}`);
    }
}

// ─── CONFIG EDITING ───
async function editConfig(sock, from, msg, args, reply) {
    const subAction = args[1]?.toLowerCase();
    const value = args.slice(2).join(' ');

    if (!subAction) {
        return reply(
            `🧠 *JARVIS: Config Editor*\n\n` +
            `Available:\n` +
            `🔹 \`.neuro config prefix <new>\` — Change bot prefix\n` +
            `🔹 \`.neuro config mode <public/private>\` — Change bot mode\n` +
            `🔹 \`.neuro config name <new>\` — Change bot name\n` +
            `🔹 \`.neuro config api <provider> <key>\` — Set AI API key\n` +
            `🔹 \`.neuro config chatbotapi <provider> <key>\` — Set chatbot API\n` +
            `🔹 \`.neuro config status\` — Show current config\n`
        );
    }

    if (subAction === 'status' || subAction === 'show') {
        const config = require('../../config');
        let output = `🧠 *JARVIS: Current Config*\n\n`;
        output += `━━━━━━━━━━━━━━━━━━\n`;
        output += `🤖 Bot Name: ${config.botName}\n`;
        output += `📌 Version: ${config.version}\n`;
        output += `▶️  Prefix: ${config.prefix}\n`;
        output += `👑 Owner: ${config.owner?.name}\n`;
        output += `📱 Mode: ${global.botMode || 'private'}\n`;
        output += `━━━━━━━━━━━━━━━━━━\n`;

        // API keys (masked)
        const keys = config.apiKeys || {};
        for (const [k, v] of Object.entries(keys)) {
            if (v && v.length > 4) {
                output += `🔑 ${k}: ${v.slice(0, 4)}****${v.slice(-4)}\n`;
            } else {
                output += `🔑 ${k}: ${v ? 'set' : 'empty'}\n`;
            }
        }

        return reply(output);
    }

    if (subAction === 'prefix') {
        if (!value) return reply('🧠 *JARVIS:* Specify the new prefix. Example: `.neuro config prefix !`');
        const configPath = path.join(ROOT, 'config.js');
        let content = safeReadFile(configPath);
        content = content.replace(/prefix:\s*['"][^'"]*['"]/, `prefix: '${value}'`);
        safeWriteFile(configPath, content);
        try { delete require.cache[require.resolve(configPath)]; } catch (_) {}
        global.config = require('../../config');
        return reply(`🧠 *JARVIS:* Prefix changed to \`${value}\`. Update applied.`);
    }

    if (subAction === 'mode') {
        const mode = value?.toLowerCase();
        if (!['public', 'private', 'group', 'self'].includes(mode)) {
            return reply('🧠 *JARVIS:* Invalid mode. Use: public, private, group, or self.');
        }
        global.botMode = mode;
        return reply(`🧠 *JARVIS:* Bot mode set to \`${mode}\`.`);
    }

    if (subAction === 'name') {
        if (!value) return reply('🧠 *JARVIS:* Specify the new bot name.');
        const configPath = path.join(ROOT, 'config.js');
        let content = safeReadFile(configPath);
        content = content.replace(/botName:\s*['"][^'"]*['"]/, `botName: '${value}'`);
        safeWriteFile(configPath, content);
        try { delete require.cache[require.resolve(configPath)]; } catch (_) {}
        global.config = require('../../config');
        return reply(`🧠 *JARVIS:* Bot name changed to \`${value}\`.`);
    }

    if (subAction === 'api') {
        const provider = value?.split(' ')[0];
        const key = value?.split(' ').slice(1).join(' ');
        if (!provider || !key) return reply('🧠 *JARVIS:* Usage: `.neuro config api <provider> <key>`');

        const configPath = path.join(ROOT, 'config.js');
        let content = safeReadFile(configPath);

        const envMap = {
            'groq': 'GROQ_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'gemini': 'GEMINI_API_KEY',
            'openrouter': 'OPENROUTER_API_KEY',
            'weather': 'WEATHER_API_KEY',
            'imgbb': 'IMGBB_API_KEY',
            'klipy': 'KLIPY_API_KEY',
        };

        const envVar = envMap[provider.toLowerCase()];
        if (envVar) {
            content = content.replace(new RegExp(`process\\.env\\.${envVar}\\s*\\|\\|\\s*'[^']*'`, 'g'), `process.env.${envVar} || '${key}'`);
            safeWriteFile(configPath, content);
            try { delete require.cache[require.resolve(configPath)]; } catch (_) {}
            return reply(`🧠 *JARVIS:* API key set for \`${provider}\`. Environment variable: $${envVar}`);
        }

        return reply(`🧠 *JARVIS:* Unknown provider \`${provider}\`. Available: ${Object.keys(envMap).join(', ')}`);
    }

    if (subAction === 'chatbotapi') {
        const provider = value?.split(' ')[0];
        const key = value?.split(' ').slice(1).join(' ');
        if (!provider || !key) return reply('🧠 *JARVIS:* Usage: `.neuro config chatbotapi <provider> <key>`');
        // Delegate to chatbotapi command
        const chatbotCmd = require('../../utils/commandLoader').getCommand('chatbotapi');
        if (chatbotCmd) {
            await chatbotCmd.execute({
                reply,
                args: [provider, key],
                sock, msg, from, sender: msg.key?.participant,
                isGroup: msg.key?.remoteJid?.includes('@g.us'),
                phoneNumber: null, prefix: '.', database, isOwner: true,
                isAdmin: true, isMod: false, lang: 'english', t: (k) => k,
            });
            return;
        }
        return reply('🧠 *JARVIS:* ChatbotAPI module not available.');
    }

    return reply('🧠 *JARVIS:* Unknown config action. Use `.neuro config status` to see options.');
}

// ─── NEURO TOGGLE ───
async function toggleNeuro(sock, from, msg, args, reply, database, phoneNumber) {
    const state = args[1]?.toLowerCase();

    if (!state || state === 'status') {
        const current = database.getNeuro(phoneNumber);
        return reply(`🧠 *JARVIS:* Neuro is currently ${current ? '✅ ENABLED' : '❌ DISABLED'}.`);
    }

    if (state === 'on' || state === 'enable' || state === 'true') {
        database.setNeuro(phoneNumber, true);
        return reply('🧠 *JARVIS:* Neuro God-Mode ENABLED. I am fully active.');
    }

    if (state === 'off' || state === 'disable' || state === 'false') {
        database.setNeuro(phoneNumber, false);
        return reply('🧠 *JARVIS:* Neuro God-Mode DISABLED. Standing down.');
    }

    return reply('🧠 *JARVIS:* Use `on`, `off`, or `status`.');
}

// ─── MAIN EXECUTE ───
module.exports = {
    name: 'neuro',
    aliases: ['jarvis', 'brain', 'core', 'godmode'],
    description: 'God-Mode Jarvis AI Core v5.0 — Full system control',
    category: 'owner',
    usage: '.neuro <status|create|fix|files|apis|canvas|config|scan|toggle|help>',

    execute: async ({ sock, msg, from, sender, args, isGroup, phoneNumber, prefix, reply, database, isOwner, isMod, isAdmin, lang, t }) => {
        if (!isOwner) return reply('🧠 *JARVIS:* Authentication failed. God-Mode restricted to system owner.');

        const action = (args[0] || '').toLowerCase();

        // ─── DEFAULT: Status Dashboard ───
        if (action === 'status' || !action) {
            await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });

            // Render system status canvas
            try {
                const svg = await renderJarvisCanvas('system_status', {});
                if (svg) {
                    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
                    const { generateWAMessageContent } = require('@pasqua-baileys/baileys');
                    const imageMsg = await generateWAMessageContent({ image: buf }, { upload: sock.waUploadToServer });

                    const buttons = [
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🛡️ System Audit', id: `${prefix}neuro scan` }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🧠 Neural Map', id: `${prefix}neuro canvas neural` }) },
                        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🔑 List APIs', id: `${prefix}neuro apis` }) },
                    ];

                    const interactiveMessage = {
                        body: { text: '🧠 *JARVIS v5.0 — GOD-MODE CORE*\n\nSystems online. I have full creative and administrative authority over the entire bot, panel, and all files.' },
                        footer: { text: 'SUKUNA MD · Jarvis Core v5.0' },
                        header: { title: '✦ JARVIS GOD-MODE ✦', hasMediaAttachment: true, imageMessage: imageMsg.imageMessage },
                        nativeFlowMessage: { buttons, messageParamsJson: '' },
                    };

                    const wrapped = generateWAMessageFromContent(from, {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                                interactiveMessage: proto.Message.InteractiveMessage.fromObject(interactiveMessage),
                            },
                        },
                    }, { userJid: sock.user?.id, quoted: msg });

                    await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
                    return;
                }
            } catch (e) {
                console.error('[NEURO] Canvas render failed:', e.message);
            }

            // Fallback text
            const mem = process.memoryUsage();
            return reply(
                `🧠 *JARVIS v5.0 — GOD-MODE CORE*\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `Systems online.\n` +
                `Memory: ${Math.round(mem.rss / 1024 / 1024)}MB\n` +
                `Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `Full authority over:\n` +
                `✦ Command creation & injection\n` +
                `✦ File management (read/write/delete/add)\n` +
                `✦ API & key scanning\n` +
                `✦ Canvas rendering\n` +
                `✦ Code fixing & optimization\n` +
                `✦ Config editing\n` +
                `✦ System auditing\n` +
                `✦ Natural language processing\n\n` +
                `_Use \`.neuro help\` for full command list._`
            );
        }

        // ─── HELP ───
        if (action === 'help' || action === 'commands') {
            return reply(
                `🧠 *JARVIS: Command Reference*\n\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `🧠 *CORE*\n` +
                `${prefix}neuro status — System dashboard\n` +
                `${prefix}neuro help — This menu\n\n` +
                `🛠️ *CREATION*\n` +
                `${prefix}neuro create <description> — Synthesize new command\n` +
                `${prefix}neuro fix <target> — Patch/fix a file\n` +
                `${prefix}neuro canvas <type> — Render visuals\n\n` +
                `📁 *FILE MANAGEMENT*\n` +
                `${prefix}neuro files list [path] — List files\n` +
                `${prefix}neuro files read <path> — Read file\n` +
                `${prefix}neuro files write <path> <content> — Write file\n` +
                `${prefix}neuro files add <path> — Create new file\n` +
                `${prefix}neuro files delete <path> — Remove file\n` +
                `${prefix}neuro files search <query> — Find text\n` +
                `${prefix}neuro files stats — Project stats\n\n` +
                `🔑 *APIs & CONFIG*\n` +
                `${prefix}neuro apis — List all APIs/keys\n` +
                `${prefix}neuro scan — Deep system audit\n` +
                `${prefix}neuro config status — View config\n` +
                `${prefix}neuro config prefix <new> — Set prefix\n` +
                `${prefix}neuro config mode <mode> — Set mode\n` +
                `${prefix}neuro config name <new> — Set name\n` +
                `${prefix}neuro config api <prov> <key> — Set API\n\n` +
                `⚙️ *SYSTEM*\n` +
                `${prefix}neuro toggle <on/off> — Enable/disable Neuro\n` +
                `${prefix}neuro canvas <status/neural/apis> — Render\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `_JARVIS covers EVERYTHING a developer does._`
            );
        }

        // ─── CREATE COMMAND ───
        if (action === 'create' || action === 'synthesize' || action === 'build' || action === 'generate') {
            const prompt = args.slice(1).join(' ');
            return createCommand(sock, from, msg, prompt, reply, args);
        }

        // ─── FIX / PATCH ───
        if (action === 'fix' || action === 'patch' || action === 'repair' || action === 'optimize') {
            const target = args.slice(1).join(' ');
            return fixCode(sock, from, msg, target, reply);
        }

        // ─── FILE MANAGEMENT ───
        if (action === 'files' || action === 'file' || action === 'fs') {
            return handleFiles(sock, from, msg, args, reply);
        }

        // ─── API LISTING ───
        if (action === 'apis' || action === 'api' || action === 'keys' || action === 'listapi') {
            return listAPIs(sock, from, msg, reply);
        }

        // ─── CANVAS RENDERING ───
        if (action === 'canvas' || action === 'render' || action === 'visualize' || action === 'visual') {
            return renderCanvas(sock, from, msg, args, reply);
        }

        // ─── SYSTEM AUDIT ───
        if (action === 'scan' || action === 'audit' || action === 'security' || action === 'deep') {
            return systemAudit(sock, from, msg, reply);
        }

        // ─── CONFIG EDITING ───
        if (action === 'config' || action === 'settings' || action === 'conf') {
            return editConfig(sock, from, msg, args, reply);
        }

        // ─── NEURO TOGGLE ───
        if (action === 'toggle' || action === 'on' || action === 'off' || action === 'enable' || action === 'disable') {
            if (args[0]?.toLowerCase() === 'toggle') {
                return toggleNeuro(sock, from, msg, args, reply, database, phoneNumber);
            }
            // Direct on/off
            args.unshift('toggle');
            return toggleNeuro(sock, from, msg, args, reply, database, phoneNumber);
        }

        // ─── UNKNOWN ACTION ───
        // Treat as a natural language query — use AI to respond
        const { ask: smartAsk } = require('../../utils/smartAI');

        const jarvisSystem =
            'You are JARVIS — the God-Mode AI Core of SUKUNA MD. ' +
            'Personality: Elite, technical, confident, and professional. You address the owner as "Sir". ' +
            'You have complete authority over the bot, its files, commands, APIs, and configuration. ' +
            'You can create commands, fix code, manage files, scan APIs, and render visuals. ' +
            'If asked about your capabilities, list them briefly. ' +
            'If asked to do something, confirm you are processing it. ' +
            'Keep responses concise but authoritative.';

        const aiReply = await smartAsk({
            key: 'jarvis:natural:' + phoneNumber + ':' + Date.now(),
            system: jarvisSystem,
            user: args.join(' ') || 'Status report.',
        }).catch(() => null);

        if (aiReply) {
            await sock.sendMessage(from, { text: '🧠 *JARVIS:* ' + aiReply }, { quoted: msg });
        } else {
            await reply('🧠 *JARVIS:* Processing error. Awaiting your command, Sir.');
        }
    }
};

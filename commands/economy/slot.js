'use strict';

const { economy, CURRENCY, SYMBOL } = require('../../utils/economyManager');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;
const REEL_COUNT = 5;
const ROW_COUNT = 3;
const MAX_BET = 10000;
const MIN_BET = 10;
const SPIN_MS = 1100;

// Keep the symbol set close to the supplied Fruit Bonanza reference.
const SYMBOLS = ['🍒', '🍋', '💎', '7️⃣', '🔔', 'BAR'];
const PAYOUT_MULTIPLIERS = {
    '7️⃣': { 3: 4, 4: 8, 5: 12 },
    '💎': { 3: 3, 4: 6, 5: 10 },
    '🔔': { 3: 2, 4: 4, 5: 8 },
    '🍒': { 3: 2, 4: 3, 5: 6 },
    '🍋': { 3: 1, 4: 2, 5: 4 },
    BAR: { 3: 2, 4: 4, 5: 7 },
};

function keyFor(jid, sender) {
    return `${jid}:${String(sender || jid).split('@')[0]}`;
}

function getState(key) {
    const existing = sessions.get(key);
    if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) return existing;
    const state = { bet: MIN_BET, bestWin: 0, updatedAt: Date.now(), spinning: false };
    sessions.set(key, state);
    return state;
}

function randomSymbol() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function randomReels() {
    return Array.from({ length: REEL_COUNT }, () =>
        Array.from({ length: ROW_COUNT }, randomSymbol)
    );
}

function spinReels() {
    const reels = randomReels();
    let winningSymbol = null;
    let winningCount = 0;
    let winningMultiplier = 0;

    // Score the three visible horizontal paylines from left to right, like a
    // conventional five-reel machine. The best line is the only payout.
    for (let row = 0; row < ROW_COUNT; row += 1) {
        const symbol = reels[0][row];
        let count = 1;
        while (count < REEL_COUNT && reels[count][row] === symbol) count += 1;
        const multiplier = PAYOUT_MULTIPLIERS[symbol]?.[count] || 0;
        if (multiplier > winningMultiplier) {
            winningSymbol = symbol;
            winningCount = count;
            winningMultiplier = multiplier;
        }
    }

    return {
        reels,
        winningSymbol,
        winningCount,
        multiplier: winningMultiplier,
    };
}

function reelText(reels) {
    return [0, 1, 2]
        .map(row => `│ ${reels.map(reel => String(reel[row]).padEnd(3, ' ')).join(' │ ')} │`)
        .join('\n');
}

function idleReels() {
    return [
        ['🍒', '🍋', '💎', '7️⃣', '🔔'],
        ['🔔', 'BAR', '🍒', '🍋', '💎'],
        ['💎', '7️⃣', '🔔', 'BAR', '🍒'],
    ];
}

function card({ name, balance, bet, bestWin, reels, status, expires = false }) {
    const visibleReels = reels || idleReels();
    return `╔════════════════════════════════════╗
║          🎰 FRUIT BONANZA 🎰        ║
║        JACKPOT · 10,000 CREDITS     ║
╠════════════════════════════════════╣
║ CREDITS: ${String(balance).padEnd(8)} BET: ${String(bet).padEnd(6)} ║
║ BEST WIN: ${String(bestWin).padEnd(22)} ║
╠════════════════════════════════════╣
${reelText(visibleReels)}
╠════════════════════════════════════╣
║ ${String(status).padEnd(34)} ║
╚════════════════════════════════════╝
${name ? `\n👤 ${name}` : ''}${expires ? '\n⏳ Slot controls expire after 30 minutes.' : ''}`;
}

function quickReply(displayText, id) {
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: displayText, id }),
    };
}

function buttonsFor(stateKey, disabled = false) {
    // WhatsApp does not support disabled native-flow buttons. During the
    // animation the message is intentionally rendered without controls, then
    // the final card restores them once the session is safe to use again.
    return disabled ? [] : [
        quickReply('💵 BET +', `slot:bet:${stateKey}`),
        quickReply('🎰 SPIN', `slot:spin:${stateKey}`),
    ];
}

async function sendCard({ sock, jid, quoted, text, buttons = [] }) {
    const message = {
        body: { text },
        footer: { text: 'SUKUNA MD · Economy' },
        header: { title: 'FRUIT BONANZA', hasMediaAttachment: false },
        nativeFlowMessage: { buttons, messageParamsJson: '' },
    };
    const wrapped = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject(message),
            },
        },
    }, { userJid: sock.user?.id, quoted });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateCard(sock, from, key, text) {
    try {
        await sock.sendMessage(from, { text, edit: key });
        return true;
    } catch (_) {
        return false;
    }
}

async function play({ sock, m, from, sender, reply, state, stateKey }) {
    if (state.spinning) return reply('🎰 Your reels are already spinning.');

    const balance = economy.getBalance(sender).wallet;
    if (state.bet < MIN_BET) state.bet = MIN_BET;
    if (balance < state.bet) {
        return reply(`❌ You need at least *${state.bet} ${CURRENCY}* to spin. Your wallet has *${balance}*.`);
    }

    state.spinning = true;
    state.updatedAt = Date.now();
    economy.removeWallet(sender, state.bet);

    const result = spinReels();
    const playerName = m.pushName || 'Player';
    const spinning = await sendCard({
        sock,
        jid: from,
        quoted: m,
        text: card({
            name: playerName,
            balance: balance - state.bet,
            bet: state.bet,
            bestWin: state.bestWin,
            reels: randomReels(),
            status: 'REELS SPINNING...',
        }),
        buttons: buttonsFor(stateKey, true),
    });

    // Give each reel a brief stagger so the message follows the left-to-right
    // stop rhythm in the reference instead of jumping straight to the result.
    const frameDelay = Math.floor(SPIN_MS / REEL_COUNT);
    for (let stopped = 1; stopped <= REEL_COUNT; stopped += 1) {
        await delay(frameDelay);
        const frame = randomReels();
        for (let column = 0; column < stopped; column += 1) frame[column] = result.reels[column];
        await updateCard(sock, from, spinning.key, card({
            name: playerName,
            balance: balance - state.bet,
            bet: state.bet,
            bestWin: state.bestWin,
            reels: frame,
            status: stopped === REEL_COUNT ? 'RESULT READY...' : 'REELS SPINNING...',
        }));
    }

    const winAmount = result.multiplier * state.bet;
    if (winAmount) economy.addWallet(sender, winAmount);
    state.bestWin = Math.max(state.bestWin, winAmount);
    state.spinning = false;
    state.updatedAt = Date.now();

    const after = economy.getBalance(sender).wallet;
    const status = winAmount ? `WIN +${winAmount}` : `LOST -${state.bet}`;
    const finalText = card({
        name: playerName,
        balance: after,
        bet: state.bet,
        bestWin: state.bestWin,
        reels: result.reels,
        status,
        expires: true,
    });

    const edited = await updateCard(sock, from, spinning.key, finalText);
    if (!edited) {
        await sendCard({ sock, jid: from, quoted: m, text: finalText, buttons: buttonsFor(stateKey) });
    } else {
        // The edit API can only replace text; send a compact control card so
        // the next interaction always has live buttons on clients that hide
        // buttons after an edit.
        await sendCard({
            sock,
            jid: from,
            quoted: m,
            text: `🎰 FRUIT BONANZA\n${status}\nCredits: ${after} · Bet: ${state.bet} · Best win: ${state.bestWin}`,
            buttons: buttonsFor(stateKey),
        });
    }
}

async function handle({ sock, msg, from, sender, reply, stateKey, action }) {
    const state = getState(stateKey);
    if (action === 'bet') {
        if (state.spinning) return reply('🎰 Wait for the current spin to finish.');
        state.bet = Math.min(MAX_BET, Math.max(MIN_BET, state.bet + MIN_BET));
        state.updatedAt = Date.now();
        const balance = economy.getBalance(sender).wallet;
        await reply(card({
            name: msg.pushName || 'Player',
            balance,
            bet: state.bet,
            bestWin: state.bestWin,
            status: `BET SET TO ${state.bet} ${SYMBOL}`,
        }));
        return true;
    }
    if (action === 'spin') {
        await play({ sock, m: msg, from, sender, reply, state, stateKey });
        return true;
    }
    return false;
}

module.exports = {
    name: 'slot',
    aliases: ['slots', 'fruitbonanza'],
    description: 'Play Fruit Bonanza slots using PASQUA Bucks',
    category: 'economy',
    async execute({ sock, m, sender, from, reply, args }) {
        const stateKey = keyFor(from, sender);
        const state = getState(stateKey);
        if (args[0] && /^\d+$/.test(args[0])) {
            state.bet = Math.min(MAX_BET, Math.max(MIN_BET, Number(args[0])));
            state.updatedAt = Date.now();
        }
        if (String(args[0] || '').toLowerCase() === 'spin') {
            return play({ sock, m, from, sender, reply, state, stateKey });
        }
        const balance = economy.getBalance(sender).wallet;
        await sendCard({
            sock,
            jid: from,
            quoted: m,
            text: card({
                name: m.pushName || 'Player',
                balance,
                bet: state.bet,
                bestWin: state.bestWin,
                status: 'Good luck',
            }),
            buttons: buttonsFor(stateKey),
        });
    },
    async handleButton(buttonId, { sock, msg, from, reply }) {
        const match = String(buttonId || '').match(/^slot:(bet|spin):(.+)$/);
        if (!match) return false;
        const sender = msg.key.participant || msg.key.remoteJid || from;
        const expectedKey = keyFor(from, sender);
        if (match[2] !== expectedKey) return false;
        return handle({ sock, msg, from, sender, reply, stateKey: expectedKey, action: match[1] });
    },
};

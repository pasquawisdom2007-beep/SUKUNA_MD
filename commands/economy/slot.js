'use strict';

const { economy, CURRENCY, SYMBOL } = require('../../utils/economyManager');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;
const SYMBOLS = ['🍒', '🍋', '💎', '7️⃣', '🔔', 'BAR'];
const PAYOUTS = { '7️⃣': 10, '💎': 8, '🔔': 6, '🍒': 4, '🍋': 3, BAR: 5 };
const MAX_BET = 10000;

function keyFor(jid, sender) {
    return `${jid}:${String(sender || jid).split('@')[0]}`;
}

function getState(key) {
    const existing = sessions.get(key);
    if (existing && Date.now() - existing.updatedAt < SESSION_TTL_MS) return existing;
    const state = { bet: 10, bestWin: 0, updatedAt: Date.now(), spinning: false };
    sessions.set(key, state);
    return state;
}

function randomSymbol() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function spinReels() {
    const reels = Array.from({ length: 5 }, () => Array.from({ length: 3 }, randomSymbol));
    const counts = new Map();
    for (const row of reels) {
        for (const symbol of row) counts.set(symbol, (counts.get(symbol) || 0) + 1);
    }
    let winningSymbol = null;
    let winningCount = 0;
    for (const [symbol, count] of counts) {
        if (count >= 3 && count > winningCount) {
            winningSymbol = symbol;
            winningCount = count;
        }
    }
    const multiplier = winningSymbol ? (PAYOUTS[winningSymbol] || 2) : 0;
    return { reels, winningSymbol, winningCount, win: multiplier ? Math.max(1, Math.floor(multiplier * 10)) : 0 };
}

function reelText(reels) {
    return [0, 1, 2].map(row => `│ ${reels.map(reel => String(reel[row]).padEnd(3, ' ')).join(' │ ')} │`).join('\n');
}

function card({ name, balance, bet, bestWin, reels, status, expires = false }) {
    const rows = reels ? reelText(reels) : '│ 🍒 │ 🍋 │ 💎 │ 7️⃣ │ 🔔 │\n│ 🔔 │ BAR │ 🍒 │ 🍋 │ 💎 │\n│ 💎 │ 7️⃣ │ 🔔 │ BAR │ 🍒 │';
    return `╔════════════════════════════════════╗
║          🎰 FRUIT BONANZA 🎰        ║
║        JACKPOT · 10,000 CREDITS     ║
╠════════════════════════════════════╣
║ CREDITS: ${String(balance).padEnd(8)} BET: ${String(bet).padEnd(6)} ║
║ BEST WIN: ${String(bestWin).padEnd(22)} ║
╠════════════════════════════════════╣
${rows}
╠════════════════════════════════════╣
║ ${status.padEnd(34)} ║
╚════════════════════════════════════╝
${name ? `\n👤 ${name}` : ''}${expires ? '\n⏳ Slot controls expire after 30 minutes.' : ''}`;
}

function quickReply(displayText, id) {
    return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: displayText, id }) };
}

async function sendCard({ sock, jid, quoted, text, buttons }) {
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

async function play({ sock, m, from, sender, reply, state, stateKey }) {
    if (state.spinning) return reply('🎰 Your reels are already spinning.');
    const balance = economy.getBalance(sender).wallet;
    if (state.bet < 1) state.bet = 10;
    if (balance < state.bet) return reply(`❌ You need at least *${state.bet} ${CURRENCY}* to spin. Your wallet has *${balance}*. Use the BET + button only after funding your wallet.`);

    state.spinning = true;
    state.updatedAt = Date.now();
    economy.removeWallet(sender, state.bet);
    const result = spinReels();
    const spinning = await sendCard({
        sock, jid: from, quoted: m,
        text: card({ name: m.pushName || 'Player', balance: balance - state.bet, bet: state.bet, bestWin: state.bestWin, status: '🎰 REELS SPINNING...' }),
        buttons: [quickReply('💵 BET +', `slot:bet:${stateKey}`), quickReply('🎰 SPIN', `slot:spin:${stateKey}`)],
    });

    await new Promise(resolve => setTimeout(resolve, 900));
    const winAmount = result.win ? result.win * state.bet : 0;
    if (winAmount) economy.addWallet(sender, winAmount);
    state.bestWin = Math.max(state.bestWin, winAmount);
    state.spinning = false;
    state.updatedAt = Date.now();
    const after = economy.getBalance(sender).wallet;
    const status = winAmount ? `🏆 WIN +${winAmount} ${SYMBOL}` : `💥 LOST -${state.bet} ${SYMBOL}`;
    const finalText = card({ name: m.pushName || 'Player', balance: after, bet: state.bet, bestWin: state.bestWin, reels: result.reels, status, expires: true });
    try {
        await sock.sendMessage(from, { text: finalText, edit: spinning.key });
    } catch (_) {
        await reply(finalText);
    }
}

async function handle({ sock, msg, from, sender, reply, stateKey, action }) {
    const state = getState(stateKey);
    if (action === 'bet') {
        state.bet = Math.min(MAX_BET, Math.max(10, state.bet + 10));
        state.updatedAt = Date.now();
        const balance = economy.getBalance(sender).wallet;
        await reply(card({ name: msg.pushName || 'Player', balance, bet: state.bet, bestWin: state.bestWin, status: `💵 BET SET TO ${state.bet} ${SYMBOL}` }));
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
        if (args[0] && /^\d+$/.test(args[0])) state.bet = Math.min(MAX_BET, Math.max(10, Number(args[0])));
        if (String(args[0] || '').toLowerCase() === 'spin') return play({ sock, m, from, sender, reply, state, stateKey });
        const balance = economy.getBalance(sender).wallet;
        await sendCard({
            sock, jid: from, quoted: m,
            text: card({ name: m.pushName || 'Player', balance, bet: state.bet, bestWin: state.bestWin, status: '🍀 GOOD LUCK!' }),
            buttons: [quickReply('💵 BET +', `slot:bet:${stateKey}`), quickReply('🎰 SPIN', `slot:spin:${stateKey}`)],
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

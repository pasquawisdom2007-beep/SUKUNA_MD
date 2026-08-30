'use strict';

const crypto = require('crypto');
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

async function sendSlotMessage({ sock, jid, quoted, text, buttons = [] }) {
    try {
        return await sendCard({ sock, jid, quoted, text, buttons });
    } catch (error) {
        // Custom interactive protobufs are not accepted by every Baileys
        // build/client. Plain text keeps `.slot` usable instead of silently
        // failing; users can always run `.slot spin` directly.
        console.error('[SLOT interactive fallback]', error.message);
        const fallback = buttons.length
            ? `${text}\n\nUse .slot spin to spin · Use .slot <amount> to set the bet.`
            : text;
        return sock.sendMessage(jid, { text: fallback }, { quoted });
    }
}

function genAISlotHtml({ balance, bet, bestWin }) {
    const safe = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;overflow:hidden;background:transparent;font-family:Arial,sans-serif}body{padding:5px;background:radial-gradient(circle at 50% 10%,#1d6a50,#07291f 70%)}.machine{padding:9px 10px 12px;border:3px solid #071f18;border-radius:22px;background:linear-gradient(110deg,#061e17,#1b644b 12%,#0b382a 52%,#28775a 94%,#071f18);box-shadow:inset 0 0 0 2px #b9954d,inset 0 0 0 5px #163f31,0 7px 16px #000b;color:#e3dfbb}.lights{height:7px;margin:0 12px 5px;border:2px solid #123d2f;border-radius:8px;background:repeating-radial-gradient(circle at 6px 50%,#dfffdc 0 2px,#82c878 3px 5px,#164936 6px 12px);animation:blink .55s steps(2) infinite}.title{padding:7px 4px 5px;border:3px solid #b99a54;border-radius:18px 18px 9px 9px;text-align:center;font:bold 21px Impact,Arial Black,sans-serif;letter-spacing:1px;color:#e9e3bc;background:radial-gradient(ellipse at 50% 0,#2b8a6c,#082a24);text-shadow:0 2px #193f31}.jackpot{width:75%;margin:3px auto 5px;padding:3px;border:2px solid #a98c4d;border-radius:10px;text-align:center;font:bold 10px monospace;color:#ded7ad;background:linear-gradient(#245d48,#0b3025)}.stats{display:flex;margin:0 2px 6px;padding:4px;border:2px solid #537d64;border-radius:9px;background:#061812}.stat{flex:1;text-align:center;border-right:1px solid #416452;color:#91b59f;font:bold 9px monospace}.stat:last-child{border:0}.stat b{display:block;margin-top:1px;color:#fff0bb;font-size:13px}.frame{padding:6px;border:4px solid #315c47;border-radius:14px;background:linear-gradient(90deg,#09271e,#b49a59 5%,#174936 10%,#174936 90%,#b49a59 95%,#09271e)}.reels{display:grid;grid-template-columns:repeat(5,1fr);height:150px;overflow:hidden;border:3px solid #071c15;border-radius:9px;background:#071a14;box-shadow:inset 0 9px 15px #0009,inset 0 -9px 15px #0009}.reel{display:grid;grid-template-rows:repeat(3,1fr);background:linear-gradient(90deg,#a58149,#fffce4 17%,#fffdf0 50%,#f7e9bd 82%,#8e6a38);border-right:2px solid #6e421e}.reel:last-child{border:0}.cell{display:grid;place-items:center;border-bottom:1px solid #9f7e4f66;font-size:clamp(24px,8vw,38px);line-height:1}.cell.bar{font:bold 13px Arial Black;color:#fff4c4;background:#8d1018}.message{height:29px;margin:6px 2px 5px;display:grid;place-items:center;border:2px solid #537d64;border-radius:8px;color:#e3dfbb;background:#061812;font:bold 12px monospace;text-shadow:0 0 6px #62a77d}.console{display:grid;grid-template-columns:1fr 1.7fr;gap:7px;padding:7px 8px 9px;border:3px solid #416a53;border-radius:9px 9px 17px 17px;background:linear-gradient(#9c8c59,#315d48 37%,#0a2e22 39%,#123e2f)}button{height:44px;border:3px solid #092a20;border-radius:13px;color:#fff;font-weight:900}#bet{background:linear-gradient(#4f9a77,#216348 53%,#103d2d)}#spin{background:radial-gradient(circle at 50% 32%,#a8d96f,#4b8d46 47%,#1e542f 76%);font-size:16px;box-shadow:0 0 12px #79b85c88}button:active{transform:scale(.96)}.moving .cell{filter:blur(1.5px);transform:translateY(5px)}.winner .message{animation:win .7s ease-in-out 2}@keyframes blink{50%{filter:brightness(2)}}@keyframes win{50%{color:#fff8bd;filter:brightness(1.5)}}
</style></head><body><div class="machine" id="machine"><div class="lights"></div><div class="title">FRUIT BONANZA</div><div class="jackpot">JACKPOT · 10,000 CREDITS</div><div class="stats"><div class="stat">CREDITS<b id="credits">${safe(balance)}</b></div><div class="stat">BET<b id="betValue">${safe(bet)}</b></div><div class="stat">BEST WIN<b id="bestWin">${safe(bestWin)}</b></div></div><div class="frame"><div class="reels" id="reels"></div></div><div class="message" id="message">Good luck</div><div class="console"><button id="bet">BET +</button><button id="spin">SPIN</button></div></div><script>(function(){
var symbols=['🍒','🍋','💎','7️⃣','🔔','BAR'],reels=document.getElementById('reels'),machine=document.getElementById('machine'),message=document.getElementById('message'),credits=document.getElementById('credits'),betValue=document.getElementById('betValue'),bestWin=document.getElementById('bestWin'),bet=Number(betValue.textContent)||10,best=Number(bestWin.textContent)||0,busy=false;
function pick(){return symbols[Math.floor(Math.random()*symbols.length)]}function draw(values){reels.innerHTML='';for(var c=0;c<5;c++){var col=document.createElement('div');col.className='reel';for(var r=0;r<3;r++){var cell=document.createElement('div');cell.className='cell'+(values[c][r]==='BAR'?' bar':'');cell.textContent=values[c][r];col.appendChild(cell)}reels.appendChild(col)}}function make(){return Array.from({length:5},function(){return Array.from({length:3},pick)})}function spin(){if(busy)return;var money=Number(credits.textContent)||0;if(money<bet){message.textContent='Not enough credits';return}busy=true;machine.classList.add('moving');message.textContent='Reels spinning...';credits.textContent=money-bet;var final=make(),started=Date.now(),timer=setInterval(function(){draw(make());if(Date.now()-started>820){clearInterval(timer);draw(final);machine.classList.remove('moving');var win=0;for(var r=0;r<3;r++){var s=final[0][r],n=1;while(n<5&&final[n][r]===s)n++;if(n>=3)win=Math.max(win,bet*(n===5?10:n===4?5:2))}credits.textContent=money-bet+win;if(win>best){best=win;bestWin.textContent=best}message.textContent=win?'WIN +'+win:'Good luck';if(win)machine.classList.add('winner');setTimeout(function(){machine.classList.remove('winner')},1500);busy=false}},90)}document.getElementById('bet').onclick=function(){if(!busy){bet=Math.min(10000,bet+10);betValue.textContent=bet;message.textContent='BET SET TO '+bet}};document.getElementById('spin').onclick=spin;draw(make())})();</script></body></html>`;
}

async function sendGenAISlot({ sock, jid, quoted, balance, bet, bestWin }) {
    const data = Buffer.from(JSON.stringify({
        __typename: 'GenAIUnifiedResponse',
        response_id: crypto.randomUUID(),
        sections: [{
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
                    trusted_sources: [],
                    payload: genAISlotHtml({ balance, bet, bestWin }),
                },
            },
        }],
    }));
    const content = proto.Message.fromObject({
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    unifiedResponse: { data },
                },
            },
        },
    });
    const wrapped = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted });
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
    const spinning = await sendSlotMessage({
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
        await sendSlotMessage({ sock, jid: from, quoted: m, text: finalText, buttons: buttonsFor(stateKey) });
    } else {
        // The edit API can only replace text; send a compact control card so
        // the next interaction always has live buttons on clients that hide
        // buttons after an edit.
        await sendSlotMessage({
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
        try {
            await sendGenAISlot({
                sock,
                jid: from,
                quoted: m,
                balance,
                bet: state.bet,
                bestWin: state.bestWin,
            });
        } catch (error) {
            console.error('[SLOT GenAI fallback]', error.message);
            await sendSlotMessage({
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
        }
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

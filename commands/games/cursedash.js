'use strict';

const crypto = require('crypto');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

function gameHtml() {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;overflow:hidden;background:transparent;font-family:Arial,sans-serif}body{padding:5px;background:radial-gradient(circle at 50% 8%,#3d174f,#10091b 68%)}.card{position:relative;padding:10px;border:2px solid #a65bdd;border-radius:22px;background:linear-gradient(145deg,#190d2e,#32134b 48%,#110818);color:#f1dcff;box-shadow:inset 0 0 0 3px #39155b,0 8px 18px #000b}.glow{height:7px;margin:0 18px 6px;border-radius:8px;background:repeating-linear-gradient(90deg,#70f0ff 0 8px,#35104b 8px 16px);box-shadow:0 0 12px #b55dff;animation:pulse .6s steps(2) infinite}.title{text-align:center;color:#f7d7ff;font:bold 22px Impact,Arial Black,sans-serif;letter-spacing:1px;text-shadow:0 0 10px #db63ff,0 2px #64118a}.sub{text-align:center;margin:1px 0 7px;color:#d8a9ef;font:11px monospace}.stats{display:flex;gap:5px;margin-bottom:7px}.stat{flex:1;padding:5px 2px;text-align:center;border:1px solid #713f95;border-radius:8px;background:#10091a;color:#bb8dce;font:bold 9px monospace}.stat b{display:block;margin-top:2px;color:#fff1ff;font-size:15px}.arena{position:relative;height:260px;overflow:hidden;border:3px solid #713f95;border-radius:14px;background:linear-gradient(#081529,#091d28 70%,#170c28);box-shadow:inset 0 0 28px #000,inset 0 -30px 30px #4b177044}.lanes{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr)}.lane{border-right:1px solid #40b7c933;background:linear-gradient(90deg,transparent,#46d6dd0b 50%,transparent)}.lane:last-child{border:0}.grid{position:absolute;inset:0;background:linear-gradient(#6cecff16 1px,transparent 1px),linear-gradient(90deg,#6cecff12 1px,transparent 1px);background-size:100% 26px,33.33% 100%;opacity:.7}.hud{position:absolute;z-index:3;top:8px;left:10px;right:10px;display:flex;justify-content:space-between;color:#d4f9ff;font:bold 10px monospace;text-shadow:0 0 6px #47dfff}.entity{position:absolute;z-index:2;display:grid;place-items:center;width:42px;height:42px;transform:translateX(-50%);font-size:28px;filter:drop-shadow(0 0 6px #ff3cdb)}#player{bottom:18px;left:50%;font-size:34px;transition:left .12s ease,transform .12s ease}.rock{top:-48px;color:#ff658d;animation:fall 1.15s linear}.orb{top:-48px;color:#fff37a;animation:fall 1.15s linear;filter:drop-shadow(0 0 9px #ffe866)}.dash{animation:dash .3s ease}.hit{animation:hit .4s ease}.message{height:32px;margin:7px 2px 6px;display:grid;place-items:center;border:1px solid #70458e;border-radius:8px;background:#0d0915;color:#f0c7ff;font:bold 12px monospace;text-shadow:0 0 7px #b454ff}.controls{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}.controls button{height:42px;border:2px solid #4e2970;border-radius:12px;color:#f9eaff;background:linear-gradient(#66328d,#2a1245);font-weight:900;font-size:17px}.controls button:active{transform:scale(.94)}#start{grid-column:1/-1;height:39px;font-size:14px;background:linear-gradient(#8c48b9,#4b1b70);box-shadow:0 0 12px #a447cc88}.hint{text-align:center;margin:6px 0 0;color:#b990c9;font:10px monospace}@keyframes pulse{50%{filter:brightness(1.8)}}@keyframes fall{to{transform:translate(-50%,320px)}}@keyframes dash{50%{transform:translateX(-50%) scale(1.3);filter:brightness(1.8)}}@keyframes hit{25%{transform:translateX(-50%) rotate(-12deg)}75%{transform:translateX(-50%) rotate(12deg)}}
</style></head><body><div class="card"><div class="glow"></div><div class="title">CURSED DASH</div><div class="sub">SURVIVE THE CURSE · COLLECT THE ORBS</div><div class="stats"><div class="stat">SCORE<b id="score">0</b></div><div class="stat">BEST<b id="best">0</b></div><div class="stat">STREAK<b id="streak">0</b></div></div><div class="arena" id="arena"><div class="lanes"><div class="lane"></div><div class="lane"></div><div class="lane"></div></div><div class="grid"></div><div class="hud"><span id="level">LEVEL 1</span><span id="speed">SPEED 1.0x</span></div><div class="entity" id="player">🐺</div></div><div class="message" id="message">Tap START to enter the cursed zone</div><div class="controls"><button id="left">◀</button><button id="dash">◆</button><button id="right">▶</button><button id="start">START RUN</button></div><div class="hint">Move, dash, and collect ✦ while avoiding ☠</div></div><script>(function(){
var arena=document.getElementById('arena'),player=document.getElementById('player'),scoreEl=document.getElementById('score'),bestEl=document.getElementById('best'),streakEl=document.getElementById('streak'),levelEl=document.getElementById('level'),speedEl=document.getElementById('speed'),msg=document.getElementById('message'),lane=1,score=0,best=Number(localStorage.cursedDashBest||0),streak=0,level=1,running=false,busy=false,spawnTimer,loopTimer;bestEl.textContent=best;
function place(){player.style.left=(lane*50/1.5+16.666)+'%'}function say(t){msg.textContent=t}function move(n){if(!running)return;lane=Math.max(0,Math.min(2,lane+n));place();player.classList.remove('dash');void player.offsetWidth;player.classList.add('dash')}function spawn(){if(!running)return;var e=document.createElement('div'),good=Math.random()<.34,eLane=Math.floor(Math.random()*3);e.className='entity '+(good?'orb':'rock');e.textContent=good?'✦':'☠';e.style.left=(eLane*50/1.5+16.666)+'%';e.dataset.lane=eLane;arena.appendChild(e);var born=Date.now(),speed=Math.max(520,1150-(level-1)*55);e.style.animationDuration=speed+'ms';setTimeout(function(){if(!e.isConnected)return;var y=e.getBoundingClientRect().top-player.getBoundingClientRect().top;if(Math.abs(y)<40&&Number(e.dataset.lane)===lane){if(good){score+=25*level;streak++;say('ORBITAL ENERGY +'+(25*level));e.remove()}else{streak=0;score=Math.max(0,score-30);player.classList.add('hit');say('CURSE HIT — keep moving');setTimeout(function(){player.classList.remove('hit')},400)}}else if(good){score+=5;streak++}e.remove();scoreEl.textContent=score;streakEl.textContent=streak;best=Math.max(best,score);bestEl.textContent=best;localStorage.cursedDashBest=best},speed+30)}function tick(){if(!running)return;level=1+Math.floor(score/250);levelEl.textContent='LEVEL '+level;speedEl.textContent='SPEED '+(1+(level-1)*.15).toFixed(1)+'x';score+=1;scoreEl.textContent=score;spawn()}function start(){if(busy)return;busy=true;running=true;score=0;streak=0;level=1;lane=1;place();scoreEl.textContent='0';streakEl.textContent='0';levelEl.textContent='LEVEL 1';say('Run started — dodge the curse');document.querySelectorAll('.entity').forEach(function(e){e.remove()});clearInterval(spawnTimer);clearInterval(loopTimer);spawnTimer=setInterval(spawn,850);loopTimer=setInterval(tick,500);setTimeout(function(){busy=false},250)}function stop(){running=false;busy=false;clearInterval(spawnTimer);clearInterval(loopTimer);document.querySelectorAll('.entity').forEach(function(e){e.remove()});say('Run ended — score '+score+' · tap START to try again')}document.getElementById('left').onclick=function(){move(-1)};document.getElementById('right').onclick=function(){move(1)};document.getElementById('dash').onclick=function(){if(running){score+=10;scoreEl.textContent=score;say('DASH BONUS +10');player.classList.add('dash');setTimeout(function(){player.classList.remove('dash')},300)}};document.getElementById('start').onclick=function(){if(running)stop();else start()};document.addEventListener('keydown',function(e){if(e.key==='ArrowLeft')move(-1);if(e.key==='ArrowRight')move(1);if(e.key===' '||e.key==='ArrowUp')document.getElementById('dash').click()});place()})();</script></body></html>`;
}

async function sendRichGame({ sock, jid, quoted }) {
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
                    payload: gameHtml(),
                },
            },
        }],
    })).toString('base64');
    const quotedContext = quoted?.key ? {
        stanzaId: quoted.key.id,
        participant: quoted.key.participant || quoted.participant || quoted.key.remoteJid,
        quotedMessage: quoted.message,
    } : {};
    const content = proto.Message.fromObject({
        messageContextInfo: {
            threadId: [],
            deviceListMetadata: {
                senderKeyIndexes: [],
                recipientKeyIndexes: [],
                recipientKeyHash: '',
                recipientTimestamp: Math.floor(Date.now() / 1000),
            },
            deviceListMetadataVersion: 2,
            messageSecret: crypto.randomBytes(32),
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [],
                    unifiedResponse: { data },
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
                        forwardOrigin: 4,
                        ...quotedContext,
                    },
                },
            },
        },
    });
    const wrapped = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

module.exports = {
    name: 'cursedash',
    aliases: ['dashgame', 'cursedashgame', 'ninjadash'],
    description: 'Play Cursed Dash, an interactive GenAI HTML mini-game',
    category: 'games',
    async execute({ sock, msg, from, reply }) {
        try {
            await sendRichGame({ sock, jid: from, quoted: msg });
        } catch (error) {
            console.error('[CURSEDASH GenAI]', error.message);
            await reply('Cursed Dash could not open on this client. Please update WhatsApp or run `.cursedash` again.');
        }
    },
};

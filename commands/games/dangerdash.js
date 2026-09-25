'use strict';

const { sendRichHtmlMessage } = require('../../utils/genaiRich');

const GAME_URL = 'https://pair.crysnovax.link';
const TRUSTED_SOURCES = ['crysnovax.link'];

function dangerDashHtml() {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
*{box-sizing:border-box}html,body{margin:0;background:#050509;font-family:Arial,sans-serif}body{padding:7px;background:radial-gradient(circle at 50% 0,#5b1020,#100812 56%,#050509);color:#ffeef2}.card{max-width:430px;margin:auto;padding:14px;border:2px solid #ff3158;border-radius:21px;background:linear-gradient(145deg,#180810,#4b0d1e 52%,#0d0710);box-shadow:inset 0 0 0 3px #68152b,0 8px 24px #000d}.title{text-align:center;color:#fff2f5;font:bold 25px Arial Black,Arial,sans-serif;letter-spacing:2px;text-shadow:0 0 14px #ff3158}.sub{text-align:center;margin:3px 0 10px;color:#f4a5b6;font:10px monospace;letter-spacing:2px}.stats{display:flex;gap:6px;margin-bottom:8px}.stats div{flex:1;padding:6px;border:1px solid #ac2344;border-radius:9px;background:#16060d;text-align:center;color:#f29bae;font:bold 9px monospace}.stats b{display:block;color:#fff;font-size:16px;margin-top:2px}.arena{position:relative;height:190px;overflow:hidden;border:2px solid #ff3158;border-radius:14px;background:linear-gradient(#180b1b,#09060e);touch-action:none}.moon{position:absolute;right:24px;top:20px;width:38px;height:38px;border-radius:50%;background:#ffd4dc;box-shadow:0 0 20px #ff6c89}.ground{position:absolute;bottom:27px;left:0;right:0;height:3px;background:#ff3158;box-shadow:0 0 12px #ff3158}.runner{position:absolute;left:48px;bottom:30px;width:25px;height:42px;border-radius:9px 9px 5px 5px;background:#ffe8ed;box-shadow:0 0 12px #ff5272;z-index:3}.runner:before{content:'';position:absolute;left:3px;top:-15px;width:19px;height:19px;border-radius:50%;background:#fff5f7}.obstacle{position:absolute;bottom:30px;width:20px;height:38px;border-radius:4px 4px 0 0;background:#ff3158;box-shadow:0 0 10px #ff3158}.obstacle:before{content:'';position:absolute;left:-8px;bottom:13px;width:36px;height:5px;background:#ff3158;border-radius:4px}.dust{position:absolute;bottom:27px;left:35px;width:7px;height:7px;border-radius:50%;background:#f7a0b0;opacity:.6}.message{min-height:31px;margin:8px 0;display:grid;place-items:center;border:1px solid #9c2340;border-radius:9px;background:#13060c;color:#ffdce3;font:bold 11px monospace;text-align:center}.controls{display:grid;grid-template-columns:1fr 1fr;gap:7px}.controls button,.restart{height:42px;border:2px solid #d1284b;border-radius:11px;color:#fff1f4;background:linear-gradient(#8b1732,#4c0d20);font-weight:900;font-size:15px}.controls button:active,.restart:active{transform:scale(.95);background:#c7284a}.restart{display:block;width:100%;margin-top:7px}.hint{text-align:center;margin-top:8px;color:#cf7f91;font:10px monospace}
</style></head><body><div class="card"><div class="title">⚠ DANGER DASH</div><div class="sub">RUN THE REDLINE · JUMP THE VOID</div><div class="stats"><div>SCORE<b id="score">0</b></div><div>BEST<b id="best">0</b></div><div>SPEED<b id="speed">1.0x</b></div></div><div class="arena" id="arena"><div class="moon"></div><div class="dust"></div><div class="ground"></div><div class="runner" id="runner"></div></div><div class="message" id="message">Tap JUMP or the arena to start</div><div class="controls"><button id="jump">JUMP</button><button id="details">DETAILS</button></div><button class="restart" id="restart">RESTART RUN</button><div class="hint">Clear obstacles · tap quickly · survive as long as possible</div></div><script>(function(){var arena=document.getElementById('arena'),runner=document.getElementById('runner'),message=document.getElementById('message'),scoreEl=document.getElementById('score'),bestEl=document.getElementById('best'),speedEl=document.getElementById('speed'),jumpBtn=document.getElementById('jump'),detailsBtn=document.getElementById('details'),restartBtn=document.getElementById('restart'),running=false,over=false,jumping=false,score=0,best=0,speed=1,timer=null,spawnTimer=null,obstacles=[];function say(t){message.textContent=t}function clearObstacles(){obstacles.forEach(function(o){o.el.remove()});obstacles=[]}function reset(){clearInterval(timer);clearInterval(spawnTimer);clearObstacles();running=false;over=false;jumping=false;score=0;speed=1;runner.style.bottom='30px';scoreEl.textContent='0';speedEl.textContent='1.0x';say('Tap JUMP or the arena to start')}function start(){if(running)return;running=true;over=false;say('Run active — jump the red barriers');timer=setInterval(step,30);spawnTimer=setInterval(spawn,Math.max(650,1150/speed));spawn()}function jump(){if(over)return reset();start();if(jumping)return;jumping=true;var startAt=Date.now();var rise=setInterval(function(){var p=(Date.now()-startAt)/540;if(p>=1){clearInterval(rise);runner.style.bottom='30px';jumping=false;return}var y=Math.sin(p*Math.PI)*88;runner.style.bottom=(30+y)+'px'},16)}function spawn(){if(!running)return;var el=document.createElement('div');el.className='obstacle';arena.appendChild(el);obstacles.push({el:el,x:arena.clientWidth+12});}function hit(a,b){var ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return ar.left<br.right&&ar.right>br.left&&ar.top<br.bottom&&ar.bottom>br.top}function end(){running=false;over=true;clearInterval(timer);clearInterval(spawnTimer);best=Math.max(best,score);bestEl.textContent=best;say('Run terminated — score '+score+' · tap RESTART');}function step(){if(!running)return;score++;if(score%100===0){speed=Math.min(2.6,speed+.12);speedEl.textContent=speed.toFixed(1)+'x'}scoreEl.textContent=Math.floor(score/10);obstacles.forEach(function(o){o.x-=4*speed;o.el.style.left=o.x+'px'});obstacles=obstacles.filter(function(o){if(o.x<-45){o.el.remove();return false}return true});if(!jumping&&obstacles.some(function(o){return hit(runner,o.el)}))end()}jumpBtn.onclick=jump;arena.onclick=jump;restartBtn.onclick=reset;detailsBtn.onclick=function(){say('DANGER DASH — jump barriers, build score, beat your best');};document.addEventListener('keydown',function(e){if(e.code==='Space'||e.key==='ArrowUp'){e.preventDefault();jump()}});reset()})();</script></body></html>`;
}

async function sendNativeRichHtml({ sock, jid, html }) {
    await sendRichHtmlMessage({ sock, jid, title: 'Danger Dash',
        html,
        url: GAME_URL,
        trustedSources: TRUSTED_SOURCES,
    });
    return true;
}

module.exports = {
    name: 'dangerdash',
    aliases: ['danger', 'dash', 'danger-dash'],
    description: 'Play Danger Dash, a jump-and-dodge obstacle mini-game',
    usage: '.dangerdash',
    category: 'games',
    async execute({ sock, msg, from, reply }) {
        const html = dangerDashHtml();
        try {
            // Native mini-app path: WhatsApp renders the open/details card
            // first, and Details opens this HTML game in the live surface.
            return await sendNativeRichHtml({ sock, jid: from, html });
        } catch (error) {
            console.error('[DANGER DASH]', error.message);
            return reply('Danger Dash could not open on this client. Please update WhatsApp or try again.');
        }
    },
};

module.exports.dangerDashHtml = dangerDashHtml;

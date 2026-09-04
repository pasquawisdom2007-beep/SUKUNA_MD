'use strict';

const { sendRichHtml } = require('../../utils/genaiRich');

const WORDS = [
    'anime','battle','chakra','courage','dragon','energy','friend','future','galaxy','hero',
    'jungle','legend','master','mission','monster','ninja','phoenix','planet','power','quest',
    'ranger','shadow','spirit','warrior','victory','village','wizard','thunder','crystal','journey',
    'academy','adventure','alchemy','captain','destiny','dreamer','element','eternal','fighter','guardian',
    'harmony','kingdom','mecha','miracle','ocean','promise','rival','samurai','summit','titan',
    'training','universe','weapon','wisdom','wonder','zephyr','arcade','blizzard','comet','cosmos',
    'demon','eclipse','forest','freedom','gravity','horizon','island','lightning','memory','oracle',
    'paladin','rebel','riddle','runner','skyline','starlight','storm','sunrise','temple','tribe',
    'ultimate','voyage','wildfire','wings','artificial','brilliant','champion','dimension','emperor','enigma',
    'flame','infinity','invincible','knight','luminous','mystery','nightmare','phantom','rescue','sacrifice',
];

function shuffle(value) {
    const chars = String(value).split('');
    for (let i = chars.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

function makeScramble(word) {
    let scrambled = shuffle(word);
    let tries = 0;
    while (scrambled === word && tries < 8) {
        scrambled = shuffle(word);
        tries += 1;
    }
    return scrambled.toUpperCase();
}

function wordScrambleHtml() {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const scrambled = makeScramble(word);
    const letters = JSON.stringify(scrambled.split(''));
    const answer = JSON.stringify(word.toUpperCase());
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:radial-gradient(circle at 50% 4%,#123b78,#050b19 75%)}.card{padding:14px;border:2px solid #42a5ff;border-radius:20px;background:linear-gradient(145deg,#071a35,#0c3769 56%,#07152b);color:#eaf5ff;box-shadow:inset 0 0 0 3px #123d70,0 8px 22px #000c}.title{text-align:center;color:#c7e8ff;font:bold 22px Arial Black,Arial,sans-serif;letter-spacing:1px;text-shadow:0 0 12px #269cff}.sub{text-align:center;margin:3px 0 10px;color:#8cc8ff;font:10px monospace}.stats{display:flex;gap:6px;margin-bottom:8px}.stats div{flex:1;padding:6px;border:1px solid #2778c7;border-radius:8px;background:#06162c;text-align:center;color:#8fcaff;font:bold 9px monospace}.stats b{display:block;color:#f2fbff;font-size:15px;margin-top:2px}.scramble{text-align:center;padding:12px 5px;border:2px solid #318dff;border-radius:12px;background:#061a33;color:#fff;font:bold 27px monospace;letter-spacing:8px;text-shadow:0 0 10px #43aaff}.selected{min-height:32px;margin:8px 0;display:grid;place-items:center;border:1px solid #347ec3;border-radius:8px;background:#051326;color:#bfe4ff;font:bold 15px monospace;letter-spacing:3px}.letters{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}.letters button,.actions button{height:39px;border:2px solid #247fd2;border-radius:10px;color:#f2f9ff;background:linear-gradient(#176ab5,#0b356d);font-weight:900;font-size:15px}.letters button:active,.actions button:active{transform:scale(.92)}.letters button.used{opacity:.35}.actions{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px}.actions button{font-size:10px}.actions .submit{background:linear-gradient(#168be5,#0b4e9a)}.message{min-height:34px;margin:8px 0 0;display:grid;place-items:center;padding:5px;border:1px solid #2b76b8;border-radius:8px;background:#06162b;color:#d5edff;font:bold 11px monospace;text-align:center}.hint{text-align:center;margin:8px 0 0;color:#82b8e6;font:10px monospace}
</style></head><body><div class="card"><div class="title">🔤 WORD SCRAMBLE</div><div class="sub">GENAI ARCADE · UNSCRAMBLE THE WORD</div><div class="stats"><div>SCORE<b id="score">0</b></div><div>ROUND<b id="round">1</b></div><div>BEST<b id="best">0</b></div></div><div class="scramble" id="scramble"></div><div class="selected" id="selected">TAP LETTERS BELOW</div><div class="letters" id="letters"></div><div class="actions"><button id="back">⌫ BACK</button><button class="submit" id="submit">SUBMIT</button><button id="new">NEW WORD</button></div><div class="message" id="message">Build the answer, then submit it</div><div class="hint">Blue interface · hints cost 2 points · new word keeps your score</div></div><script>(function(){var target=${answer},scrambled=${letters},score=0,best=0,round=1,chosen=[],used=[];var scramble=document.getElementById('scramble'),selected=document.getElementById('selected'),letters=document.getElementById('letters'),message=document.getElementById('message'),scoreEl=document.getElementById('score'),roundEl=document.getElementById('round'),bestEl=document.getElementById('best');function draw(){scramble.textContent=scrambled.join(' ');selected.textContent=chosen.length?chosen.join(''):'TAP LETTERS BELOW';letters.innerHTML='';scrambled.forEach(function(ch,i){var b=document.createElement('button');b.textContent=ch;b.className=used.indexOf(i)>=0?'used':'';b.onclick=function(){if(used.indexOf(i)>=0)return;used.push(i);chosen.push(ch);draw()};letters.appendChild(b)});scoreEl.textContent=score;roundEl.textContent=round;bestEl.textContent=best}function resetWord(){var copy=target.split('');for(var i=copy.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=copy[i];copy[i]=copy[j];copy[j]=t}if(copy.join('')===target&&copy.length>1){var t=copy[0];copy[0]=copy[1];copy[1]=t}scrambled=copy;chosen=[];used=[];message.textContent='Build the answer, then submit it';draw()}document.getElementById('back').onclick=function(){if(chosen.length){chosen.pop();used.pop();draw()}};document.getElementById('submit').onclick=function(){var answer=chosen.join('');if(!answer){message.textContent='Choose the letters first';return}if(answer===target){score+=10;best=Math.max(best,score);message.textContent='Correct — +10 points! Tap NEW WORD';draw()}else{score=Math.max(0,score-1);message.textContent='Not quite — try again';draw()}};document.getElementById('new').onclick=function(){round++;target=WORDS[Math.floor(Math.random()*WORDS.length)].toUpperCase();var copy=target.split('');for(var i=copy.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=copy[i];copy[i]=copy[j];copy[j]=t}scrambled=copy;chosen=[];used=[];message.textContent='New word loaded';draw()};draw()})();</script></body></html>`;
}

module.exports = {
    name: 'wordscramble',
    aliases: ['word scramble', 'scramble', 'wordgame'],
    description: 'Play an interactive blue GenAI word-scramble game',
    usage: '.wordscramble',
    category: 'games',
    async execute({ sock, msg, from, reply }) {
        try {
            await sendRichHtml({ sock, jid: from, quoted: msg, html: wordScrambleHtml() });
        } catch (error) {
            console.error('[WORD SCRAMBLE GenAI]', error.message);
            await reply('Word Scramble could not open on this client. Please update WhatsApp or run `.wordscramble` again.');
        }
    },
};

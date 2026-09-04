'use strict';

const { sendRichHtml } = require('../../utils/genaiRich');
const games = new Map();

function shuffle(values) {
    const a = values.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function solvedBoard() {
    const base = (r, c) => (r * 3 + Math.floor(r / 3) + c) % 9;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const rows = shuffle([0, 1, 2]).flatMap(group => shuffle([0, 1, 2]).map(offset => group * 3 + offset));
    const cols = shuffle([0, 1, 2]).flatMap(group => shuffle([0, 1, 2]).map(offset => group * 3 + offset));
    return rows.map(r => cols.map(c => nums[base(r, c)]));
}
function newGame() {
    const solution = solvedBoard();
    const puzzle = solution.map(row => row.slice());
    for (const index of shuffle([...Array(81).keys()]).slice(0, 45)) puzzle[Math.floor(index / 9)][index % 9] = 0;
    return { puzzle, solution, moves: 0 };
}
function textBoard(game) {
    const lines = ['SUDOKU', '', '    1 2 3   4 5 6   7 8 9'];
    for (let r = 0; r < 9; r++) {
        const row = game.puzzle[r].map(n => n || '·');
        lines.push(`${r + 1} | ${row.slice(0, 3).join(' ')} | ${row.slice(3, 6).join(' ')} | ${row.slice(6).join(' ')}`);
        if ([2, 5].includes(r)) lines.push('  +-------+-------+-------');
    }
    return lines.join('\n');
}
function sudokuHtml(game) {
    const puzzle = JSON.stringify(game.puzzle);
    const solution = JSON.stringify(game.solution);
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:7px;background:radial-gradient(circle at 50% 5%,#123b63,#06101f 75%);font-family:Arial,sans-serif;color:#e8f7ff}.card{max-width:420px;margin:auto;padding:15px;border:2px solid #35c9ff;border-radius:18px;background:linear-gradient(145deg,#081c35,#0b3854);box-shadow:0 0 22px #00aeff33}.title{text-align:center;color:#b8f1ff;font:bold 23px Arial Black,Arial;text-shadow:0 0 10px #16c9ff}.sub{text-align:center;color:#8fc7df;font:11px monospace;margin:5px 0 12px}.board{display:grid;grid-template-columns:repeat(9,1fr);border:2px solid #5bdcff;background:#071321}.cell{display:grid;place-items:center;aspect-ratio:1;border:1px solid #28617b;font:bold 20px monospace;color:#61e6ff;background:#0a2439;padding:0}.cell:nth-child(3n){border-right:2px solid #61dcff}.cell:nth-child(27n+1),.cell:nth-child(27n+10),.cell:nth-child(27n+19){border-top:2px solid #61dcff}.fixed{color:#fff;background:#123f5e}.selected{background:#1b6790!important;box-shadow:inset 0 0 0 2px #fff}.wrong{background:#7f2535!important}.numbers{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}.numbers button,.actions button{height:36px;border:1px solid #38bde8;border-radius:8px;background:#0c3958;color:#d9f8ff;font:bold 14px monospace}.numbers button:active,.actions button:active{transform:scale(.95);background:#1c7096}.actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.status{text-align:center;min-height:20px;margin-top:9px;color:#b8efff;font:12px monospace}.footer{text-align:center;margin-top:9px;color:#72b5cb;font:10px monospace}</style></head><body><div class="card"><div class="title">SUDOKU</div><div class="sub">GENAI INTERACTIVE PUZZLE · MOVE ${game.moves}</div><div class="board" id="board"></div><div class="numbers" id="numbers"></div><div class="actions"><button id="check">CHECK</button><button id="reset">NEW PUZZLE</button></div><div class="status" id="status">Tap an empty cell, then choose a number</div><div class="footer">SUKUNA MD · PLAY INSIDE THIS CARD</div></div><script>(function(){var puzzle=${puzzle},solution=${solution},selected=-1,board=document.getElementById('board'),numbers=document.getElementById('numbers'),status=document.getElementById('status');function render(){board.innerHTML='';for(var i=0;i<81;i++){var r=Math.floor(i/9),c=i%9,b=document.createElement('button');b.className='cell '+(puzzle[r][c]?'fixed':'open')+(selected===i?' selected':'');b.textContent=puzzle[r][c]||'·';b.disabled=Boolean(puzzle[r][c]);(function(index){b.onclick=function(){selected=index;status.textContent='Choose a number for this cell';render()}})(i);board.appendChild(b)}}for(var n=1;n<=9;n++){var button=document.createElement('button');button.textContent=n;(function(value){button.onclick=function(){if(selected<0)return status.textContent='Select an empty cell first';var r=Math.floor(selected/9),c=selected%9;if(value===solution[r][c]){puzzle[r][c]=value;status.textContent='Correct';selected=-1;render()}else{status.textContent='Not quite — try another number';var cell=board.children[selected];cell.classList.add('wrong');setTimeout(function(){cell.classList.remove('wrong')},500)}}})(n);numbers.appendChild(button)}var clear=document.createElement('button');clear.textContent='CLEAR';clear.onclick=function(){if(selected>=0&&!puzzle[Math.floor(selected/9)][selected%9])status.textContent='Cell cleared'};numbers.appendChild(clear);document.getElementById('check').onclick=function(){var done=puzzle.every(function(row){return row.every(Boolean)});status.textContent=done?'Puzzle solved':'Keep going — fill every cell'};document.getElementById('reset').onclick=function(){location.reload()};render()})();</script></body></html>`;
}
async function sendBoard({ sock, msg, from, reply, game }) {
    try { await sendRichHtml({ sock, jid: from, quoted: msg, html: sudokuHtml(game) }); }
    catch (error) { console.error('[SUDOKU GenAI]', error.message); await reply(textBoard(game)); }
}
module.exports = {
    name: 'sudoku',
    aliases: ['sudokugame'],
    description: 'Play Sudoku entirely inside a WhatsApp GenAI card',
    category: 'games',
    async execute({ sock, msg, reply, args, from, sender }) {
        const key = from || sender || 'private';
        const action = String(args[0] || '').toLowerCase();
        if (!games.has(key) || action === 'new' || action === 'start') games.set(key, newGame());
        const game = games.get(key);
        if (args.length && action !== 'new' && action !== 'start') return sendBoard({ sock, msg, from, reply, game });
        return sendBoard({ sock, msg, from, reply, game });
    },
};

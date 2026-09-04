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
    const cells = game.puzzle.flatMap((row, r) => row.map((value, c) => `<span class="cell ${value ? 'fixed' : 'open'}">${value || '·'}</span>`)).join('');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:7px;background:radial-gradient(circle at 50% 5%,#123b63,#06101f 75%);font-family:Arial,sans-serif;color:#e8f7ff}.card{max-width:420px;margin:auto;padding:15px;border:2px solid #35c9ff;border-radius:18px;background:linear-gradient(145deg,#081c35,#0b3854);box-shadow:0 0 22px #00aeff33}.title{text-align:center;color:#b8f1ff;font:bold 23px Arial Black,Arial;text-shadow:0 0 10px #16c9ff}.sub{text-align:center;color:#8fc7df;font:11px monospace;margin:5px 0 12px}.board{display:grid;grid-template-columns:repeat(9,1fr);border:2px solid #5bdcff;background:#071321}.cell{display:grid;place-items:center;aspect-ratio:1;border:1px solid #28617b;font:bold 20px monospace}.cell:nth-child(3n){border-right:2px solid #61dcff}.cell:nth-child(27n+1),.cell:nth-child(27n+10),.cell:nth-child(27n+19){border-top:2px solid #61dcff}.fixed{color:#fff;background:#123f5e}.open{color:#61e6ff;background:#0a2439}.info{margin-top:12px;padding:10px;border:1px solid #287793;border-radius:9px;color:#c9efff;font:12px/1.5 monospace}.footer{text-align:center;margin-top:9px;color:#72b5cb;font:10px monospace}</style></head><body><div class="card"><div class="title">SUDOKU</div><div class="sub">GENAI PUZZLE BOARD · MOVE ${game.moves}</div><div class="board">${cells}</div><div class="info">Empty cells are marked ·<br>Send: .sudoku row column number<br>Example: .sudoku 4 7 9<br>New puzzle: .sudoku new · Check: .sudoku check</div><div class="footer">SUKUNA MD · GENAI RICH GAME</div></div></body></html>`;
}
async function sendBoard({ sock, msg, from, reply, game }) {
    try { await sendRichHtml({ sock, jid: from, quoted: msg, html: sudokuHtml(game) }); }
    catch (error) { console.error('[SUDOKU GenAI]', error.message); await reply(textBoard(game)); }
}
module.exports = {
    name: 'sudoku',
    aliases: ['sudokugame'],
    description: 'Play an interactive Sudoku puzzle in WhatsApp GenAI',
    category: 'games',
    async execute({ sock, msg, reply, args, from, sender }) {
        const key = from || sender || 'private';
        const action = String(args[0] || '').toLowerCase();
        if (!games.has(key) || action === 'new' || action === 'start') games.set(key, newGame());
        const game = games.get(key);
        if (action === 'check') {
            const complete = game.puzzle.every((row, r) => row.every((n, c) => n === game.solution[r][c]));
            return reply(complete ? '✅ Sudoku solved! Start another with `.sudoku new`.' : '⏳ The puzzle is not complete yet. Keep going.');
        }
        if (args.length === 3 && args.every(value => /^\d+$/.test(value))) {
            const [r, c, n] = args.map(Number);
            if (r < 1 || r > 9 || c < 1 || c > 9 || n < 1 || n > 9) return reply('Use numbers from 1 to 9: `.sudoku row column number`.');
            if (game.puzzle[r - 1][c - 1] !== 0) return reply('That cell is fixed already. Choose an empty cell marked `·`.');
            if (game.solution[r - 1][c - 1] !== n) return reply('❌ That number is not correct for this cell. Try again.');
            game.puzzle[r - 1][c - 1] = n;
            game.moves++;
        }
        const complete = game.puzzle.every(row => row.every(Boolean));
        if (complete) return reply('🎉 Sudoku solved! Start another with `.sudoku new`.');
        return sendBoard({ sock, msg, from, reply, game });
    },
};

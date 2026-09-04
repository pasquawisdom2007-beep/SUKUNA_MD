'use strict';

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
    const cells = shuffle([...Array(81).keys()]);
    for (const index of cells.slice(0, 45)) puzzle[Math.floor(index / 9)][index % 9] = 0;
    return { puzzle, solution, moves: 0 };
}

function render(game) {
    const lines = ['🧩 *SUDOKU*', '', '    1 2 3   4 5 6   7 8 9'];
    for (let r = 0; r < 9; r++) {
        const row = game.puzzle[r].map(n => n || '·');
        lines.push(`${r + 1} | ${row.slice(0, 3).join(' ')} | ${row.slice(3, 6).join(' ')} | ${row.slice(6).join(' ')}`);
        if ([2, 5].includes(r)) lines.push('  +-------+-------+-------');
    }
    lines.push('', 'Move: `.sudoku row column number` (example: `.sudoku 4 7 9`)');
    lines.push('Start over with `.sudoku new`; finish with `.sudoku check`.');
    return lines.join('\n');
}

module.exports = {
    name: 'sudoku',
    aliases: ['sudokugame'],
    description: 'Play an interactive Sudoku puzzle',
    category: 'games',
    async execute({ reply, args, from, sender }) {
        const key = from || sender || 'private';
        const action = String(args[0] || '').toLowerCase();
        if (!games.has(key) || action === 'new' || action === 'start') games.set(key, newGame());
        const game = games.get(key);
        if (action === 'check') {
            const complete = game.puzzle.every((row, r) => row.every((n, c) => n === game.solution[r][c]));
            return reply(complete ? '✅ *Sudoku solved!* Start another with `.sudoku new`.' : '⏳ The puzzle is not complete yet. Keep going.');
        }
        if (args.length === 3 && args.every(value => /^\d+$/.test(value))) {
            const [r, c, n] = args.map(Number);
            if (r < 1 || r > 9 || c < 1 || c > 9 || n < 1 || n > 9) return reply('Use numbers from 1 to 9: `.sudoku row column number`.');
            if (game.puzzle[r - 1][c - 1] !== 0) return reply('That cell is fixed already. Choose an empty cell marked `·`.');
            if (game.solution[r - 1][c - 1] !== n) return reply('❌ That number is not correct for this cell. Try again.');
            game.puzzle[r - 1][c - 1] = n;
            game.moves++;
            const complete = game.puzzle.every(row => row.every(Boolean));
            return reply(complete ? '🎉 *Sudoku solved!* Start another with `.sudoku new`.' : `✅ Correct. Move ${game.moves} recorded.\n\n${render(game)}`);
        }
        return reply(render(game));
    },
};

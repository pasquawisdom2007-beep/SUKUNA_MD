'use strict';

const games = new Map();
const values = { a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10 };
const letters = 'eeeeeeeeeeeeaaaaaaaaaiiiiiiiiii oooooonnnnnnrrrrrrttttttllllsssssuuuuddddgggbbccmmppffhhvvwwyykjxqz'.replace(/\s/g, '');

function draw(count) {
    const rack = [];
    for (let i = 0; i < count; i++) rack.push(letters[Math.floor(Math.random() * letters.length)]);
    return rack;
}
function score(word) { return [...word].reduce((total, ch) => total + (values[ch] || 0), 0); }
function render(game) {
    return `🔤 *WORD SCRABBLE*\n\nRack: *${game.rack.join(' ').toUpperCase()}*\nScore: *${game.score}*\nWords: *${game.words.length}*\n\nSubmit a word with \.scrabble <word>.\nUse \.scrabble new for a new rack or \.scrabble end to finish.`;
}

module.exports = {
    name: 'scrabble',
    aliases: ['wordgame', 'wordscrabble'],
    description: 'Play a lightweight Word Scrabble game',
    category: 'games',
    async execute({ reply, args, from, sender }) {
        const key = from || sender || 'private';
        const action = String(args[0] || '').toLowerCase();
        if (!games.has(key) || action === 'new' || action === 'start') games.set(key, { rack: draw(7), score: 0, words: [] });
        const game = games.get(key);
        if (action === 'end') {
            games.delete(key);
            return reply(`🏁 *Scrabble finished*\nFinal score: *${game.score}*\nWords played: *${game.words.length}*\nStart again with \.scrabble.`);
        }
        if (!args.length || action === 'new' || action === 'start') return reply(render(game));
        const word = args.join('').toLowerCase().replace(/[^a-z]/g, '');
        if (word.length < 2 || word.length > 15) return reply('Enter a word containing 2–15 letters.');
        const available = game.rack.slice();
        for (const ch of word) {
            const index = available.indexOf(ch);
            if (index === -1) return reply(`You cannot make *${word.toUpperCase()}* from your rack: *${game.rack.join(' ').toUpperCase()}*.`);
            available.splice(index, 1);
        }
        const gained = score(word) + (word.length === 7 ? 50 : 0);
        game.score += gained;
        game.words.push(word);
        game.rack = available.concat(draw(7 - available.length));
        return reply(`✅ *${word.toUpperCase()}* = ${gained} points\n\n${render(game)}`);
    },
};

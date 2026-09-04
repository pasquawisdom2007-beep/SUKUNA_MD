'use strict';

const { sendRichHtml } = require('../../utils/genaiRich');
const games = new Map();
const values = { a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10 };
const letters = 'eeeeeeeeeeeeaaaaaaaaaiiiiiiiiii oooooonnnnnnrrrrrrttttttllllsssssuuuuddddgggbbccmmppffhhvvwwyykjxqz'.replace(/\s/g, '');
function draw(count) { return Array.from({ length: count }, () => letters[Math.floor(Math.random() * letters.length)]); }
function score(word) { return [...word].reduce((total, ch) => total + (values[ch] || 0), 0); }
function textBoard(game) { return `WORD SCRABBLE\n\nRack: ${game.rack.join(' ').toUpperCase()}\nScore: ${game.score}\nWords: ${game.words.length}`; }
function scrabbleHtml(game) {
    const rack = game.rack.map((letter, index) => `<span class="tile"><b>${letter.toUpperCase()}</b><small>${values[letter]}</small></span>`).join('');
    const history = game.words.length ? game.words.slice(-5).map(word => `<li>${word.toUpperCase()} <b>${score(word)} pts</b></li>`).join('') : '<li>No words played yet</li>';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:7px;background:radial-gradient(circle at 50% 5%,#55320f,#1a0e05 76%);font-family:Arial,sans-serif;color:#fff5d7}.card{max-width:420px;margin:auto;padding:16px;border:2px solid #e9b858;border-radius:18px;background:linear-gradient(145deg,#38200b,#6a3a12 55%,#241004);box-shadow:0 0 22px #ffaf2733}.title{text-align:center;color:#ffe5a1;font:bold 23px Arial Black,Arial;text-shadow:0 0 10px #ffb52e}.sub{text-align:center;color:#e8bd72;font:11px monospace;margin:5px 0 15px}.stats{display:flex;justify-content:space-around;margin-bottom:14px;color:#ffe8ac;font:bold 14px monospace}.rack{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin:10px 0 16px}.tile{display:flex;flex-direction:column;align-items:center;justify-content:center;width:42px;height:48px;border:2px solid #9b641e;border-radius:8px;background:linear-gradient(145deg,#f5cc73,#b87922);color:#3b2108;box-shadow:0 3px 5px #0008}.tile b{font:22px Georgia}.tile small{font:bold 9px monospace}.history{padding:10px;border:1px solid #ae762b;border-radius:9px;background:#1d0d05;color:#f7d992;font:12px monospace}.history ul{margin:6px 0 0;padding-left:18px}.info{text-align:center;margin-top:12px;color:#e6b968;font:11px/1.5 monospace}.footer{text-align:center;margin-top:9px;color:#c28c3e;font:10px monospace}</style></head><body><div class="card"><div class="title">WORD SCRABBLE</div><div class="sub">GENAI WORD GAME · BUILD WORDS FROM YOUR RACK</div><div class="stats"><span>SCORE ${game.score}</span><span>WORDS ${game.words.length}</span></div><div class="rack">${rack}</div><div class="history"><b>RECENT WORDS</b><ul>${history}</ul></div><div class="info">Send: .scrabble &lt;word&gt;<br>New rack: .scrabble new · Finish: .scrabble end</div><div class="footer">SUKUNA MD · GENAI RICH GAME</div></div></body></html>`;
}
async function sendBoard({ sock, msg, from, reply, game }) {
    try { await sendRichHtml({ sock, jid: from, quoted: msg, html: scrabbleHtml(game) }); }
    catch (error) { console.error('[SCRABBLE GenAI]', error.message); await reply(textBoard(game)); }
}
module.exports = {
    name: 'scrabble',
    aliases: ['wordgame', 'wordscrabble'],
    description: 'Play Word Scrabble in WhatsApp GenAI',
    category: 'games',
    async execute({ sock, msg, reply, args, from, sender }) {
        const key = from || sender || 'private';
        const action = String(args[0] || '').toLowerCase();
        if (!games.has(key) || action === 'new' || action === 'start') games.set(key, { rack: draw(7), score: 0, words: [] });
        const game = games.get(key);
        if (action === 'end') {
            games.delete(key);
            return reply(`🏁 Scrabble finished\nFinal score: ${game.score}\nWords played: ${game.words.length}`);
        }
        if (!args.length || action === 'new' || action === 'start') return sendBoard({ sock, msg, from, reply, game });
        const word = args.join('').toLowerCase().replace(/[^a-z]/g, '');
        if (word.length < 2 || word.length > 15) return reply('Enter a word containing 2–15 letters.');
        const available = game.rack.slice();
        for (const ch of word) {
            const index = available.indexOf(ch);
            if (index === -1) return reply(`You cannot make ${word.toUpperCase()} from this rack: ${game.rack.join(' ').toUpperCase()}.`);
            available.splice(index, 1);
        }
        const gained = score(word) + (word.length === 7 ? 50 : 0);
        game.score += gained;
        game.words.push(word);
        game.rack = available.concat(draw(7 - available.length));
        return sendBoard({ sock, msg, from, reply, game });
    },
};

/**
 * Ping Command — Sukuna MD short bold-italic latency bar
 * One line, bold-italic brand + 5-block bar + ms.
 */

const PHRASES = [
    'UNTOUCHABLE.',
    'EXPECTING SOMETHING SLOW?',
    'RYŌIKI TENKAI.',
    'EVEN LIGHT AIN’T THIS FAST.',
    'CURSED ENERGY ONLINE.',
    'DOMAIN EXPANDED.',
    'THE CORE IS AWAKE.',
    'NO LAG. JUST FEAR.',
    'TOO FAST TO SEE.',
    'SUKUNA APPROVES.',
    'REACTION TIME: ILLEGAL.',
    'THE VOID COULD NOT KEEP UP.',
    'FASTER THAN A CURSE.',
    'ZERO DELAY. FULL POWER.',
    'THE SERVER BENDS.',
    'SPEED OF THE KING.',
    'NOTHING ESCAPES THIS PING.',
    'RUNNING ON PURE CHAOS.',
    'THE SIGNAL HAS SPOKEN.',
    'INSTANT IMPACT.',
    'NO MERCY FOR LATENCY.',
    'CLEAN. COLD. CONNECTED.',
    'THE CROWN IS ONLINE.',
    'TOO SHARP TO BUFFER.',
    'ABSOLUTE RESPONSE.',
    'CURSED CORE RESPONDING.',
    'BEYOND THE SPEED LIMIT.',
    'THE NETWORK KNEELS.',
    'FAST ENOUGH TO CUT SPACE.',
    'PULSE LOCKED.',
];

const BOLD_DIGITS = Array.from('𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗');
const NORMAL_LETTERS = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
const BOLD_LETTERS = Array.from('𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳');

function toBoldDigits(value) {
    return String(value).replace(/\d/g, digit => BOLD_DIGITS[Number(digit)]);
}

function toBoldText(value) {
    return String(value).replace(/[A-Za-z]/g, char => BOLD_LETTERS[NORMAL_LETTERS.indexOf(char)] || char);
}

function pickPhrase() {
    return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

module.exports = {
    name: 'ping',
    aliases: ['speed', 'latency'],
    description: 'Check bot response speed',
    usage: '.ping',
    category: 'admin',

    async execute({ sock, msg, from, reply }) {
        const start = Date.now();
        let placeholder = null;
        try {
            placeholder = await sock.sendMessage(from, { text: '⛧ ' + boldItalic('pinging') + ' ⛧' }, { quoted: msg });
        } catch (_) {}

        const ms = Date.now() - start;
        const result = `⚡ ${toBoldDigits(ms)}𝐦𝐬 | ${toBoldText(pickPhrase())}`;

        if (placeholder?.key) {
            try {
                await sock.sendMessage(from, { text: result, edit: placeholder.key });
                return;
            } catch (_) {}
        }
        // pass raw so the auto-boxer in sessionManager doesn't wrap our one-liner
        await reply(result, { raw: true });
    }
};

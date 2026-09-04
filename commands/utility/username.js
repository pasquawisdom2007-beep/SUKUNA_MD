'use strict';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/i;

function decodeUsernameResult(raw) {
    try {
        const resultNode = raw?.content?.find(node => node?.tag === 'result')?.content;
        return resultNode ? JSON.parse(Buffer.from(resultNode).toString()) : null;
    } catch (_) {
        return null;
    }
}

function normalizeUsername(value) {
    return String(value || '')
        .trim()
        .replace(/^@+/, '')
        .replace(/[\s,]+/g, '')
        .toLowerCase();
}

async function checkUsernames(sock, usernames, delay = 1000) {
    const success = [];
    const checked = [];

    for (let i = 0; i < usernames.length; i += 10) {
        try {
            const raw = await sock.query({
                tag: 'iq',
                attrs: {
                    to: '@s.whatsapp.net',
                    type: 'get',
                    xmlns: 'w:mex',
                    id: typeof sock.generateMessageTag === 'function'
                        ? sock.generateMessageTag()
                        : `${Date.now()}-${i}`,
                },
                content: [{
                    tag: 'query',
                    attrs: { query_id: '27134626522840286' },
                    content: Buffer.from(JSON.stringify({
                        variables: { usernames: usernames.slice(i, i + 10) },
                    })),
                }],
            });

            const results = decodeUsernameResult(raw)?.data?.xwa2_username_check_multi?.results;
            if (!Array.isArray(results) || !results.length) {
                return { success, checked, aborted: true, reason: 'cooldown', nextIndex: i };
            }

            checked.push(...results.map(item => ({
                username: item?.username,
                result: item?.response?.result,
            })).filter(item => item.username));
            success.push(...results
                .filter(item => item?.response?.result === 'SUCCESS')
                .map(item => item.username));
        } catch (_) {
            return { success, checked, aborted: true, reason: 'cooldown', nextIndex: i };
        }

        if (i + 10 < usernames.length) await sleep(delay);
    }

    return { success, checked, aborted: false };
}

module.exports = {
    name: 'username',
    aliases: ['usercheck', 'checkusername', 'wausername'],
    description: 'Check WhatsApp username availability',
    usage: '.username @name [name2 name3]',
    category: 'utility',

    async execute({ sock, args, reply }) {
        const usernames = [...new Set(args.map(normalizeUsername).filter(Boolean))];
        if (!usernames.length) {
            return reply('🔎 Usage: `.username @pasqua` or `.username name1 name2`');
        }

        const invalid = usernames.filter(name => !USERNAME_RE.test(name));
        if (invalid.length) {
            return reply(`⚠️ Invalid username: ${invalid.slice(0, 3).map(name => `@${name}`).join(', ')}`);
        }

        const limited = usernames.slice(0, 30);
        if (usernames.length > limited.length) {
            await reply('ℹ️ Checking the first 30 usernames to avoid WhatsApp cooldowns…');
        }

        const result = await checkUsernames(sock, limited);
        if (result.aborted && !result.checked.length) {
            return reply('⏳ WhatsApp temporarily limited username checks. Try again later.');
        }

        const available = new Set(result.success.map(normalizeUsername));
        const lines = result.checked.map(item => {
            const name = normalizeUsername(item.username);
            return `${available.has(name) ? '✅' : '❌'} @${name} — ${available.has(name) ? 'available' : 'unavailable'}`;
        });

        const footer = result.aborted
            ? '\n\n⏳ WhatsApp stopped the check early because of a cooldown.'
            : '';
        return reply(`🔎 *WhatsApp Username Check*\n\n${lines.join('\n') || 'No results returned.'}${footer}`);
    },
};

module.exports.checkUsernames = checkUsernames;

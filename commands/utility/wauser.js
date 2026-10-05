'use strict';

const MAX_RESULTS = 30;

function digits(value) {
    return String(value || '').replace(/\D/g, '');
}

function jidToNumber(jid) {
    const raw = String(jid || '').split('@')[0].split(':')[0];
    return /^\d{7,15}$/.test(raw) ? `+${raw}` : '';
}

async function lookupNumbers(sock, values) {
    const jids = values.map(number => `${number}@s.whatsapp.net`);
    if (typeof sock?.onWhatsApp !== 'function') throw new Error('number lookup is unavailable in this Baileys build');
    const rows = await sock.onWhatsApp(...jids);
    return (Array.isArray(rows) ? rows : []).map(row => ({
        jid: row?.jid || '',
        number: jidToNumber(row?.jid),
        exists: row?.exists === true,
    }));
}

async function lookupGlobalUsername(sock, query) {
    if (typeof sock?.findUserByUsername !== 'function') {
        throw new Error('global username lookup is unavailable in this Baileys build');
    }
    const username = String(query || '').trim().replace(/^@+/, '').toLowerCase();
    if (!/^[a-z0-9._-]{1,30}$/i.test(username)) return null;
    const result = await sock.findUserByUsername(username);
    if (!result?.jid) return null;
    return {
        jid: result.jid,
        number: jidToNumber(result.jid),
        username,
        contact: result.contact === true,
    };
}

module.exports = {
    name: 'wauser',
    aliases: ['whatsappuser', 'wasearch', 'usersearch'],
    description: 'Search WhatsApp users globally by number or exact username',
    usage: '.wauser <username|number>',
    category: 'utility',

    async execute({ sock, args = [], reply, isOwner, isAdmin }) {
        if (!isOwner && !isAdmin) return reply('🔒 *Owner/admin only.* This search can reveal WhatsApp contact identifiers.');
        const query = args.join(' ').trim();
        if (!query) {
            return reply('🔎 Usage: `.wauser John` or `.wauser 2348012345678`\n\nNumber checks and exact @username lookups query WhatsApp globally. Maximum: 30 numbers per request.');
        }

        const numberParts = args
            .map(value => String(value).trim())
            .filter(value => /^[+()\d][\d\s().-]*$/.test(value))
            .map(digits)
            .filter(value => /^\d{7,15}$/.test(value));

        if (numberParts.length) {
            const numbers = [...new Set(numberParts)].slice(0, MAX_RESULTS);
            try {
                const rows = await lookupNumbers(sock, numbers);
                const lines = numbers.map((number, index) => {
                    const row = rows[index];
                    return `${row?.exists ? '✅' : '❌'} +${number} — ${row?.exists ? 'registered on WhatsApp' : 'not found'}`;
                });
                return reply(`🔎 *Global WhatsApp Number Search*\n\n${lines.join('\n')}\n\n_Checked ${numbers.length}/${numberParts.length} requested number${numberParts.length === 1 ? '' : 's'}._`);
            } catch (error) {
                return reply(`❌ WhatsApp number search failed: ${error.message || 'temporary lookup error'}`);
            }
        }

        if (query.includes(' ')) {
            return reply('⚠️ WhatsApp username lookup requires one exact username, for example `.wauser @john`. WhatsApp does not expose wildcard display-name search.');
        }

        try {
            const result = await lookupGlobalUsername(sock, query);
            if (!result) {
                return reply(`🔎 No global WhatsApp account was returned for exact username *@${query.replace(/^@+/, '').toLowerCase()}*. This command does not treat username availability as a person result.`);
            }
            return reply(`🔎 *Global WhatsApp User Result*\n\nUsername: *@${result.username}*\nJID: \`${result.jid}\`\nNumber: ${result.number || 'not exposed by WhatsApp'}\nContact: ${result.contact ? 'yes' : 'no'}`);
        } catch (error) {
            return reply(`❌ Global WhatsApp username search failed: ${error.message || 'temporary lookup error'}`);
        }
    },
};

module.exports.MAX_RESULTS = MAX_RESULTS;
module.exports.jidToNumber = jidToNumber;
module.exports.lookupGlobalUsername = lookupGlobalUsername;

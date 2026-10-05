'use strict';

const MAX_RESULTS = 30;

function fold(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function digits(value) {
    return String(value || '').replace(/\D/g, '');
}

function jidToNumber(jid) {
    const raw = String(jid || '').split('@')[0].split(':')[0];
    return /^\d{7,15}$/.test(raw) ? `+${raw}` : '';
}

function contactFields(contact) {
    const jid = contact?.id || contact?.jid || contact?.phoneNumber || '';
    return {
        jid: String(jid),
        number: jidToNumber(jid) || jidToNumber(contact?.phoneNumber),
        name: String(contact?.name || contact?.notify || contact?.pushName || contact?.verifiedName || contact?.short || '').trim(),
        username: String(contact?.username || contact?.userName || '').trim(),
    };
}

function getCachedContacts(sock) {
    const map = sock?.__sukunaContacts;
    if (map instanceof Map) return [...map.values()];
    if (Array.isArray(sock?.contacts)) return sock.contacts;
    if (Array.isArray(sock?.store?.contacts)) return sock.store.contacts;
    return [];
}

function formatContact(item, index) {
    const label = item.name || item.username || 'Unknown contact';
    const username = item.username ? `\n   Username: @${item.username.replace(/^@+/, '')}` : '';
    return `${index}. *${label}*\n   Number: ${item.number || 'not exposed by WhatsApp'}${username}`;
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

async function lookupExactUsername(sock, query) {
    if (typeof sock?.findUserByUsername !== 'function') return null;
    const username = String(query || '').trim().replace(/^@+/, '').toLowerCase();
    if (!/^[a-z0-9._-]{1,30}$/i.test(username)) return null;
    try {
        const result = await sock.findUserByUsername(username);
        if (!result?.jid) return null;
        return {
            jid: result.jid,
            number: jidToNumber(result.jid),
            name: username,
            username,
            contact: result.contact === true,
        };
    } catch (_) {
        return null;
    }
}

module.exports = {
    name: 'wauser',
    aliases: ['whatsappuser', 'wasearch', 'usersearch'],
    description: 'Search WhatsApp numbers, exact usernames, and cached contact names',
    usage: '.wauser <name|username|number>',
    category: 'utility',

    async execute({ sock, args = [], reply, isOwner, isAdmin }) {
        if (!isOwner && !isAdmin) return reply('🔒 *Owner/admin only.* This search can reveal WhatsApp contact identifiers.');
        const query = args.join(' ').trim();
        if (!query) {
            return reply('🔎 Usage: `.wauser John` or `.wauser 2348012345678`\n\nName searches use contacts already known to the bot; number checks query WhatsApp directly. Maximum: 30 results.');
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
                return reply(`🔎 *WhatsApp Number Search*\n\n${lines.join('\n')}\n\n_Checked ${numbers.length}/${numberParts.length} requested number${numberParts.length === 1 ? '' : 's'}._`);
            } catch (error) {
                return reply(`❌ WhatsApp number search failed: ${error.message || 'temporary lookup error'}`);
            }
        }

        const needle = fold(query);
        const matches = getCachedContacts(sock)
            .map(contactFields)
            .filter(item => item.jid && (fold(item.name).includes(needle) || fold(item.username).includes(needle) || fold(item.jid).includes(needle)))
            .filter((item, index, list) => list.findIndex(other => other.jid === item.jid) === index)
            .slice(0, MAX_RESULTS);

        if (matches.length) {
            return reply(`🔎 *WhatsApp Contact Search*\nQuery: _${query}_\nResults: *${matches.length}*\n\n${matches.map(formatContact).join('\n\n')}\n\n_Search is limited to contacts already known by this bot._`);
        }

        const username = await lookupExactUsername(sock, query);
        if (username) {
            return reply(`🔎 *WhatsApp Username Result*\n\nUsername: *@${username.username}*\nJID: \`${username.jid}\`\nNumber: ${username.number || 'not exposed by WhatsApp'}\nContact: ${username.contact ? 'yes' : 'no'}`);
        }

        return reply(`🔎 No cached WhatsApp contact matched *${query}*.\n\nWhatsApp does not provide a general public directory search by display name. Try the full phone number, an exact @username, or search after the bot has encountered/synced that contact.`);
    },
};

module.exports.MAX_RESULTS = MAX_RESULTS;
module.exports.fold = fold;
module.exports.contactFields = contactFields;

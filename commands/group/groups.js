'use strict';

/**
 * groups — inventory of every group the bot account has joined
 * ===========================================================
 *
 *   .groups              → first page (20 groups)
 *   .groups 2            → page 2
 *   reply the listing with `1`  → full details for group 1 + Copy JID button
 *
 * Each entry shows: name, member count, admin count and the JID (copy-pasteable
 * into `.gcstatus <jid> <text>`).
 *
 * Reply-by-number
 *   The listing message key is stored with the exact ordered JID list. When you
 *   reply to that message with a bare number, the detail card is rebuilt from
 *   that snapshot — no network call, so it works even when WhatsApp throttles
 *   group metadata.
 *
 * Category: general (per request) — lives in commands/general/.
 */

const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');
const botIdentity = require('../../utils/botIdentity');

const PAGE_SIZE   = Number(process.env.GROUPS_PAGE_SIZE || 20);
const CHUNK_LIMIT = 3500;
const TTL_MS      = 30 * 60 * 1000;
const MAX_SNAPSHOTS = 25;
const TAG = 'GROUPS';

/** message-id → { chat, at, entries:[…] } */
const snapshots = new Map();

const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function pruneSnapshots() {
    const cutoff = Date.now() - TTL_MS;
    for (const [key, value] of snapshots) {
        if (!value || value.at < cutoff) snapshots.delete(key);
    }
    while (snapshots.size > MAX_SNAPSHOTS) {
        snapshots.delete(snapshots.keys().next().value);
    }
}

function rememberListing(messageId, chat, entries) {
    if (!messageId || !Array.isArray(entries) || !entries.length) return;
    pruneSnapshots();
    snapshots.set(messageId, { chat, at: Date.now(), entries });
}

function recallListing(messageId) {
    if (!messageId) return null;
    const hit = snapshots.get(messageId);
    if (!hit) return null;
    if (Date.now() - hit.at > TTL_MS) { snapshots.delete(messageId); return null; }
    return hit;
}

// ── data ─────────────────────────────────────────────────────────────

function countAdmins(participants = []) {
    return participants.filter(p => p && (p.admin === 'admin' || p.admin === 'superadmin')).length;
}

function cleanSubject(subject, jid) {
    const raw = String(subject || '').replace(/\s+/g, ' ').trim();
    if (!raw) return `Untitled (${String(jid).split('@')[0].slice(-6)})`;
    return raw.length > 42 ? `${raw.slice(0, 41)}…` : raw;
}

function formatDate(seconds) {
    const value = Number(seconds || 0) * 1000;
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) { return '—'; }
}

async function fetchGroups(sock) {
    let map = null;
    let source = 'live';

    if (typeof sock?.groupFetchAllParticipating === 'function') {
        try { map = await sock.groupFetchAllParticipating(); }
        catch (error) { console.error(`[${TAG}] groupFetchAllParticipating failed:`, error.message); }
    }

    if (!map || !Object.keys(map).length) {
        map = sock?.store?.groupMetadata || sock?.groupMetadata || null;
        source = 'cache';
    }

    const list = [];
    for (const [jid, meta] of Object.entries(map || {})) {
        if (!jid || !jid.endsWith('@g.us')) continue;
        const participants = Array.isArray(meta?.participants) ? meta.participants : [];
        list.push({
            jid,
            subject: cleanSubject(meta?.subject || meta?.name, jid),
            members: participants.length,
            admins: countAdmins(participants),
            announce: meta?.announce === true || meta?.isCommunityAnnounce === true,
            community: meta?.isCommunity === true || !!meta?.linkedParent,
            created: formatDate(meta?.creation),
        });
    }

    list.sort((a, b) => a.subject.localeCompare(b.subject, 'en', { sensitivity: 'base' }));
    return { list, source };
}

// ── rendering ────────────────────────────────────────────────────────

function renderEntry(group, index) {
    const flags = [];
    if (group.announce) flags.push('announce');
    if (group.community) flags.push('community');
    return [
        `${index}. ${group.subject}`,
        `   👥 members ${group.members}  ·  🛡️ admins ${group.admins}${flags.length ? `  ·  ⚑ ${flags.join(' + ')}` : ''}`,
        `   🔗 ${group.jid}`,
    ].join('\n');
}

function detailBody(group, index, prefix) {
    return [
        '╭─❒ ◈ 𝗚𝗥𝗢𝗨𝗣 𝗗𝗘𝗧𝗔𝗜𝗟𝗦 ❒',
        '│',
        `│ 🔢 Number  : ${index}`,
        `│ 📛 Name    : ${group.subject}`,
        `│ 🔗 JID     : ${group.jid}`,
        `│ 👥 Members : ${group.members}`,
        `│ 🛡️ Admins  : ${group.admins}`,
        `│ 📣 Mode    : ${group.announce ? 'Announce (admins only)' : 'Open'}`,
        `│ 🏷️ Type    : ${group.community ? 'Community' : 'Standard'}`,
        `│ 📅 Created : ${group.created || '—'}`,
        '│',
        '├──────────────────────────────',
        `│ ▸ Post a status here:`,
        `│   ${prefix}gcstatus ${group.jid} Hello world`,
        `│ ▸ Or reply to any message with:`,
        `│   ${prefix}gcstatus ${group.jid}`,
        '╰─⛧ Sukuna MD',
    ].join('\n');
}

function copiesToButtons(group, index, prefix) {
    return [
        {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: '📋 Copy Group JID',
                id: `groups_jid_${index}`,
                copy_code: group.jid,
            }),
        },
        {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: '📛 Copy Group Name',
                id: `groups_name_${index}`,
                copy_code: group.subject,
            }),
        },
        {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: '⚡ Copy Status Command',
                id: `groups_cmd_${index}`,
                copy_code: `${prefix}gcstatus ${group.jid} `,
            }),
        },
    ];
}

/** Interactive card with copy buttons; returns false when the relay fails. */
async function sendDetailCard({ sock, msg, from, group, index, prefix }) {
    const body = detailBody(group, index, prefix);
    try {
        const wrapped = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: body },
                        footer: { text: `${botIdentity.getName()} · GROUP ${index}` },
                        header: { title: '✦ GROUP DETAILS ✦', hasMediaAttachment: false },
                        nativeFlowMessage: {
                            buttons: copiesToButtons(group, index, prefix),
                            messageParamsJson: '',
                        },
                    }),
                },
            },
        }, { userJid: sock?.user?.id, ...(msg?.message ? { quoted: msg } : {}) });

        await sock.relayMessage(from, wrapped.message, { messageId: wrapped.key.id });
        return true;
    } catch (error) {
        console.error(`[${TAG}] detail card relay failed:`, error.message);
        return false;
    }
}

/** Stanza id of the message this one replies to, whatever its type. */
function getReplyStanzaId(msg) {
    const m = msg?.message || {};
    const contexts = [
        m.extendedTextMessage?.contextInfo,
        m.imageMessage?.contextInfo,
        m.videoMessage?.contextInfo,
        m.audioMessage?.contextInfo,
        m.documentMessage?.contextInfo,
        m.stickerMessage?.contextInfo,
        m.buttonsResponseMessage?.contextInfo,
        m.templateButtonReplyMessage?.contextInfo,
        m.interactiveResponseMessage?.contextInfo,
    ].filter(Boolean);
    for (const ctx of contexts) {
        if (ctx?.stanzaId) return String(ctx.stanzaId);
    }
    return '';
}

// ── command ──────────────────────────────────────────────────────────

module.exports = {
    name: 'groups',
    aliases: ['group', 'grouplist', 'listgroups', 'mygroups', 'allgroups'],
    description: 'List every group the bot is in (members, admins, JID)',
    usage: '.groups [page] · reply the listing with a number',
    category: 'general',

    async execute(ctx) {
        const { sock, msg, reply, prefix = '.', isOwner, isMod, isSessionOwner } = ctx || {};
        const args = Array.isArray(ctx?.args) ? ctx.args.slice() : String(ctx?.args || '').split(/\s+/).filter(Boolean);
        const from = ctx?.from || msg?.key?.remoteJid;

        const requester = (isSessionOwner !== undefined ? isSessionOwner : isOwner) === true || isMod === true;
        if (!requester) {
            return reply('🔒 _Only the bot owner and mods can list the groups._', { raw: true });
        }

        // ── reply-by-number: answer from the stored snapshot, no network ──
        const stanzaId = getReplyStanzaId(msg);
        const first = String(args[0] || '').trim();
        if (stanzaId && /^\d+$/.test(first)) {
            const snapshot = recallListing(stanzaId);
            if (snapshot) {
                const index = Number(first);
                const entry = snapshot.entries.find(item => item.index === index);
                if (!entry) {
                    return reply(
                        `❌ _Number ${index} is not on that list._\n` +
                        `_Valid range: 1–${snapshot.entries[snapshot.entries.length - 1]?.index || snapshot.entries.length}._`,
                        { raw: true }
                    );
                }

                const sent = await sendDetailCard({ sock, msg, from, group: entry, index, prefix });
                if (!sent) {
                    // Plain fallback so the copy value is never lost.
                    return reply(detailBody(entry, index, prefix), { raw: true });
                }
                return true;
            }
        }

        if (typeof sock?.groupFetchAllParticipating !== 'function' &&
            !sock?.store?.groupMetadata && !sock?.groupMetadata) {
            return reply('❌ _This Baileys build cannot enumerate groups._', { raw: true });
        }

        await reply('⏳ _Collecting groups…_', { raw: true });

        let list = [];
        let source = 'live';
        try {
            ({ list, source } = await fetchGroups(sock));
        } catch (error) {
            console.error(`[${TAG}]`, error.message);
            return reply(`❌ _Could not read the group list._\n_Reason: ${String(error.message || error).slice(0, 180)}_`, { raw: true });
        }

        if (!list.length) {
            return reply(
                '📭 *No groups found.*\n\n' +
                `_The bot is not a member of any group yet. Add it to one and run \`${prefix}groups\` again._`,
                { raw: true }
            );
        }

        const totalMembers = list.reduce((sum, g) => sum + g.members, 0);
        const totalAdmins  = list.reduce((sum, g) => sum + g.admins, 0);
        const totalPages   = Math.max(1, Math.ceil(list.length / PAGE_SIZE));

        let page = 1;
        const pageArg = String(args[0] || '').trim();
        if (/^\d+$/.test(pageArg)) page = Math.min(Math.max(1, Number(pageArg)), totalPages);

        const start = (page - 1) * PAGE_SIZE;
        const slice = list.slice(start, start + PAGE_SIZE);

        const header = [
            '╭─❒ ◈ 𝗚𝗥𝗢𝗨𝗣𝗦 (ᵇᵒᵗ ᵃᶜᶜᵒᵘⁿᵗ) ❒',
            '│',
            `│ 📊 Registered : ${list.length} groups`,
            `│ 👥 Members    : ${totalMembers}`,
            `│ 🛡️ Admins     : ${totalAdmins}`,
            `│ 📄 Page       : ${page}/${totalPages} · ${slice.length} shown`,
            source === 'cache' ? '│ ⚠️ Source     : cached metadata (live call throttled)' : '│ 📡 Source     : live',
            '│',
            '├──────────────────────────────',
            '│',
        ].join('\n');

        const footer = [
            '│',
            '├──────────────────────────────',
            `│ 💬 Reply this message with a number (1–${start + slice.length})`,
            '│    to see that group + a Copy JID button.',
            `│ ▸ ${prefix}gcstatus <jid> <text>  →  post a status there`,
            page < totalPages ? `│ Next page: ${prefix}groups ${page + 1}` : '│ That is every group.',
            '╰─⛧ Sukuna MD',
        ].join('\n');

        const entries = slice.map((group, i) => ({ ...group, index: start + i + 1 }));
        const body = entries.map((group, i) => `│ ${renderEntry(group, start + i + 1)}`).join('\n│\n');

        // Send the listing, then tie its message id to the ordered JIDs so a
        // numeric reply can be resolved without another API call.
        const deliver = async (text) => {
            const sent = await reply(text, { raw: true });
            const id = sent?.key?.id || sent?.id || sent?.messageId || '';
            rememberListing(id, from, entries);
            return id;
        };

        let message = `${header}\n${body}\n${footer}`;
        if (message.length > CHUNK_LIMIT) {
            const chunks = [];
            let current = header;
            for (const group of entries) {
                const row = `│ ${renderEntry(group, group.index)}`;
                if ((current + '\n' + row).length > CHUNK_LIMIT) {
                    chunks.push(current);
                    current = '╭─❒ ◈ 𝗚𝗥𝗢𝗨𝗣𝗦 · ᶜᵒⁿᵗ ⁒ ❒\n│';
                }
                current += `\n${row}`;
            }
            chunks.push(`${current}\n${footer}`);
            let lastId = '';
            for (const chunk of chunks) lastId = await deliver(chunk);
            return lastId || true;
        }

        await deliver(message);
        return true;
    },

    _private: {
        fetchGroups, countAdmins, cleanSubject, renderEntry, detailBody,
        getReplyStanzaId, rememberListing, recallListing, sendDetailCard,
        snapshots, pruneSnapshots,
    },
};

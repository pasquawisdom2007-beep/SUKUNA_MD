'use strict';
/**
 * eventManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised handler for group participant events:
 *   • Welcome messages  (member joins)
 *   • Goodbye messages  (member leaves / is removed)
 *   • Intro cards       (member joins, when enabled)
 *
 * Design: messages fire IMMEDIATELY — no blocking on metadata or profile pics.
 * PP/metadata fetches race against a short deadline; text fallback is instant.
 */

const database = require('../utils/database');
const fs       = require('fs');

// ── Styling constants ─────────────────────────────────────────────────────────
const TITLE_BOLD    = '𝙎𝙐𝙆𝙐᳇𝘼';
const FOOTER_ITALIC = '𝓹𝓪𝓼𝓺𝓾𝓪 𝓿𝓮𝓻𝓲𝓯𝓲𝓮𝓭';
const DIVIDER       = '━━━━━━━━━━━━━━━━━━━━━';

// ── Intro card themes ─────────────────────────────────────────────────────────
const THEMES = {
    default: { top: '🌟', mid: '✦', star: '⭐', wave: '〰️', gem: '💎' },
    dark:    { top: '🖤', mid: '◆', star: '🌑', wave: '▬',  gem: '🔮' },
    fire:    { top: '🔥', mid: '🌟', star: '💥', wave: '〰️', gem: '🏆' },
    ocean:   { top: '🌊', mid: '🐚', star: '💙', wave: '〰️', gem: '🐬' },
    royal:   { top: '👑', mid: '♦',  star: '🌟', wave: '━',  gem: '💍' },
    light:   { top: '☀️', mid: '✨', star: '🌸', wave: '〰️', gem: '🦋' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _normJid(j) {
    return (j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function _participantJid(p) {
    if (!p) return '';
    if (typeof p === 'string') return p;
    return p.phoneNumber || p.id || p.jid || '';
}

/** Race a promise against a timeout; resolves to null on timeout/error */
function _withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(null), ms)),
    ]).catch(() => null);
}

function _fetchPP(sock, jid) {
    return _withTimeout(sock.profilePictureUrl(jid, 'image'), 3500);
}

function _fetchMeta(sock, groupId) {
    return _withTimeout(sock.groupMetadata(groupId), 3500);
}

// ── Banner builder (welcome / goodbye) ───────────────────────────────────────

function buildBanner(kind, participant, groupName, memberCount, customMsg) {
    const number      = _participantJid(participant).split('@')[0].split(':')[0];
    const userMention = `@${number}`;
    const action      = kind === 'welcome' ? 'Welcome to' : 'Goodbye from';
    const greeting    = kind === 'welcome' ? 'Hello'      : 'Farewell';
    const tail        = customMsg
        ? customMsg
            .replace(/@user/g,     userMention)
            .replace(/\{name\}/gi, userMention)
            .replace(/@group/g,    groupName)
            .replace(/\{group\}/gi, groupName)
            .replace(/\{count\}/gi, String(memberCount))
        : (kind === 'welcome' ? 'Welcome to the group! 🎉' : 'We will miss you! 👋');

    return (
        `┏━〔 ✦ ${TITLE_BOLD} 〕━\n` +
        `❏┃ ${action} *${groupName}*\n` +
        `❏┃ ${greeting} ${userMention}\n` +
        `❏┃ Members: ${memberCount || '...'}\n` +
        `❏┃ ${tail}\n` +
        `\n` +
        `${FOOTER_ITALIC}\n` +
        `${DIVIDER}`
    );
}

// ── Intro card builder ────────────────────────────────────────────────────────

function buildIntroCard(participant, groupName, memberCount, grp) {
    const number = _participantJid(participant).split('@')[0].split(':')[0];
    const t      = THEMES[grp.introcardTheme] || THEMES.default;
    const title  = grp.introcardTitle || `Welcome to ${groupName}`;
    const body   = grp.introcardMessage
        ? grp.introcardMessage
            .replace(/@user/g,     `@${number}`)
            .replace(/\{name\}/gi, `@${number}`)
            .replace(/@group/g,    groupName)
            .replace(/\{group\}/gi, groupName)
        : `Hey @${number}! 👋\nWe're so glad you joined us.\nIntroduce yourself to the family! 🎉`;

    const line = '━━━━━━━━━━━━━━━━━━━━━━━━';
    return (
        `${t.top}${t.top}${t.top} *${title.toUpperCase()}* ${t.top}${t.top}${t.top}\n` +
        `${line}\n\n` +
        `${t.star} *NEW MEMBER* ${t.star}\n` +
        `👤 @${number}\n\n` +
        `${line}\n\n` +
        `${t.gem} *Group:* ${groupName}\n` +
        `👥 *Members:* ${memberCount || '...'}\n\n` +
        `${line}\n\n` +
        `${body}\n\n` +
        `${line}\n` +
        `${t.mid} _𝙎𝙐𝙆𝙐᳇𝘼_ ${t.mid}  •  t.me/Pasquaking`
    );
}

// ── Core send: fires text INSTANTLY, upgrades to image if PP arrives in time ──

async function _sendWithOptionalPP(sock, groupId, participant, caption) {
    participant = _participantJid(participant);
    const opts = {
        mentions:    [participant],
        contextInfo: { mentionedJid: [participant] },
    };

    // Start PP fetch in parallel — don't await it yet
    const ppPromise = _fetchPP(sock, participant);

    // Race: send text immediately OR with image if PP arrives within 2.5s
    const PP_DEADLINE = 2500;
    let ppUrl = null;
    try {
        ppUrl = await Promise.race([
            ppPromise,
            new Promise(resolve => setTimeout(() => resolve(null), PP_DEADLINE)),
        ]);
    } catch (_) {}

    if (ppUrl) {
        try {
            await sock.sendMessage(groupId, { image: { url: ppUrl }, caption, ...opts });
            return;
        } catch (_) {
            // image send failed — fall through to text
        }
    }
    await sock.sendMessage(groupId, { text: caption, ...opts });
}

async function _sendIntroWithOptionalPP(sock, groupId, groupPicPromise, caption, participant) {
    participant = _participantJid(participant);
    const mentions = [participant];
    const opts     = { mentions, contextInfo: { mentionedJid: mentions } };

    let gpicUrl = null;
    try {
        gpicUrl = await Promise.race([
            groupPicPromise,
            new Promise(resolve => setTimeout(() => resolve(null), 2500)),
        ]);
    } catch (_) {}

    if (gpicUrl) {
        try {
            await sock.sendMessage(groupId, { image: { url: gpicUrl }, caption, ...opts });
            return;
        } catch (_) {}
    }
    await sock.sendMessage(groupId, { text: caption, ...opts });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a welcome or goodbye banner.
 * Exported so commands can call it directly for test/preview.
 */
async function sendBanner(sock, groupId, participant, kind, groupName, memberCount, customMsg) {
    const caption = buildBanner(kind, participant, groupName || 'the group', memberCount || 0, customMsg);
    await _sendWithOptionalPP(sock, groupId, participant, caption);
}

/**
 * Send an intro card.
 * Exported so .introcard preview can call it directly.
 */
async function sendIntroCard(sock, groupId, participant, meta, grp) {
    if (!grp)  grp  = database.getGroup(groupId);
    const groupName   = meta?.subject || 'the group';
    const memberCount = meta?.participants?.length || 0;
    const caption     = buildIntroCard(participant, groupName, memberCount, grp);

    // If a welcome video has been set for this group (via .introcard video),
    // welcome the member with the video + a SHORT caption (like the normal
    // welcome message). No newsletter/"view channel" pill is attached here.
    const vid = grp.introcardVideo;
    if (vid && fs.existsSync(vid)) {
        const jid    = _participantJid(participant);
        const number = jid.split('@')[0].split(':')[0];
        const shortMsg = grp.introcardMessage
            ? grp.introcardMessage
                .replace(/@user/g, `@${number}`)
                .replace(/\{name\}/gi, `@${number}`)
                .replace(/@group/g, groupName)
                .replace(/\{group\}/gi, groupName)
            : `👋 Welcome @${number} to *${groupName}*!\n🎉 Glad to have you here.`;
        try {
            await sock.sendMessage(groupId, {
                video:       { url: vid },
                mimetype:    'video/mp4',
                gifPlayback: true,
                caption:     shortMsg,
                mentions:    [jid],
                contextInfo: { mentionedJid: [jid] },
            });
            return;
        } catch (e) {
            console.error('[eventManager] intro video send failed, falling back to image:', e.message);
            // fall through to image/text below
        }
    }

    // Group PP fetched in parallel with send
    const gpicPromise = sock.profilePictureUrl(groupId, 'image').catch(() => null);
    await _sendIntroWithOptionalPP(sock, groupId, gpicPromise, caption, participant);
}

/**
 * Main event handler — called by sessionManager on group-participants.update.
 * Also called by welcome/goodbye/introcard commands for test/preview.
 *
 * FAST PATH: metadata is fetched in parallel with the send so it never blocks.
 * If meta arrives before PP deadline, memberCount is accurate.
 * If not, '...' is shown — still sends instantly.
 */
async function handleGroupParticipantsEvent(sock, phoneNumber, { id, participants, action, author }) {
    try {
        const grp = database.getGroup(id);

        // Quick-exit if nothing to do
        const needsWelcome  = action === 'add'    && grp.welcome;
        const needsIntro    = action === 'add'    && grp.introcard;
        const needsGoodbye  = action === 'remove' && grp.goodbye;

        if (!needsWelcome && !needsIntro && !needsGoodbye) return;

        const botJid          = _normJid(sock.user?.id);
        const safeParticipants = (participants || [])
            .map(_participantJid)
            .filter(Boolean)
            .filter(jid => _normJid(jid) !== botJid);
        if (!safeParticipants.length) return;

        // Kick off metadata fetch in background — we won't block on it
        const metaPromise = _fetchMeta(sock, id);

        // For welcome/goodbye: build caption with what we have NOW (no meta yet)
        // then send. If meta arrives fast it'll have a real count; if not it shows '...'
        if (needsWelcome || needsGoodbye) {
            // Try to get meta with a SHORT deadline (1.5s) so fast responses are used
            const meta = await _withTimeout(metaPromise, 1500);
            const groupName   = meta?.subject || 'the group';
            const memberCount = meta?.participants?.length || 0;

            for (const p of safeParticipants) {
                try {
                    if (needsWelcome) {
                        const caption = buildBanner('welcome', p, groupName, memberCount, grp.welcomeMessage || null);
                        // Don't await — fire and move on
                        _sendWithOptionalPP(sock, id, p, caption).catch(e =>
                            console.error('[eventManager] welcome send error:', e.message)
                        );
                    }
                    if (needsGoodbye) {
                        const caption = buildBanner('goodbye', p, groupName, memberCount, grp.goodbyeMessage || null);
                        _sendWithOptionalPP(sock, id, p, caption).catch(e =>
                            console.error('[eventManager] goodbye send error:', e.message)
                        );
                    }
                } catch (e) {
                    console.error('[eventManager] banner error:', e.message);
                }
            }
        }

        // Intro card — same pattern, uses group PP not user PP
        if (needsIntro) {
            const meta = await _withTimeout(metaPromise, 1500);
            for (const p of safeParticipants) {
                try {
                    await sendIntroCard(sock, id, p, meta, grp);
                } catch (e) {
                    console.error('[eventManager] introcard error:', e.message);
                }
            }
        }

    } catch (e) {
        console.error('[eventManager] handleGroupParticipantsEvent error:', e.message);
    }
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
    handleGroupParticipantsEvent,
    sendBanner,
    sendIntroCard,
};

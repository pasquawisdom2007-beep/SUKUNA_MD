'use strict';

const crypto = require('crypto');
const database = require('./database');
const {
    detectBotSignals,
    findParticipant,
    participantIdentifiers,
    sameIdentity,
    shortJid,
} = require('./antiBotSignals');

const CHALLENGE_TIMEOUT_MS = 60_000;
const MAX_FAILURES = 2;
const MAX_PENDING_PER_GROUP = 50;

function normalizeJid(value) {
    return String(value || '').trim().replace(/:\d+(?=@)/, '');
}

function pendingKey(groupId, jid) {
    return `${groupId}:${normalizeJid(jid)}`;
}

function messageText(message) {
    const content = message?.message || {};
    return String(
        content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || ''
    ).trim();
}

function messageSender(message) {
    return message?.key?.participant || message?.participant || message?.key?.remoteJid || '';
}

function botIdentities(sock) {
    return [sock.user?.id, sock.user?.lid, sock.user?.jid, sock.user?.phoneNumber].filter(Boolean);
}

function isBotSelf(sock, jid) {
    return botIdentities(sock).some(identity => sameIdentity(identity, jid));
}

function botIsAdmin(meta, sock) {
    return !!meta?.participants?.some(participant =>
        participantIdentifiers(participant).some(id => isBotSelf(sock, id)) && !!participant.admin
    );
}

function isAdmin(meta, jid) {
    return !!findParticipant(meta, jid)?.admin;
}

function getState(sock) {
    if (!sock.__sukunaAntiBotState) {
        sock.__sukunaAntiBotState = {
            pending: new Map(),
            ready: false,
        };
    }
    return sock.__sukunaAntiBotState;
}

async function sendWarning(sock, groupId, jid, text) {
    await sock.sendMessage(groupId, { text, mentions: [jid] }).catch(() => {});
}

async function removeMember(sock, groupId, jid, reason, canRemove) {
    if (!canRemove) {
        await sendWarning(sock, groupId, jid, `⚠️ *AntiBot:* @${shortJid(jid)} matched a bot check, but I need group-admin rights to remove it.`, jid);
        return false;
    }
    try {
        await sock.groupParticipantsUpdate(groupId, [jid], 'remove');
        await sock.sendMessage(groupId, {
            text: `🤖 *AntiBot:* @${shortJid(jid)} was removed.\n_${reason}_`,
            mentions: [jid],
        }).catch(() => {});
        return true;
    } catch (error) {
        console.error('[ANTIBOT] removal failed:', error.message);
        await sendWarning(sock, groupId, jid, `⚠️ *AntiBot:* I detected @${shortJid(jid)}, but removal failed. Make me a group admin and try again.`);
        return false;
    }
}

function clearPending(state, entry) {
    if (!entry) return;
    clearTimeout(entry.timer);
    state.pending.delete(pendingKey(entry.groupId, entry.jid));
}

async function finishChallenge(sock, state, entry, outcome, detail) {
    if (!entry || !state.pending.has(pendingKey(entry.groupId, entry.jid))) return;
    clearPending(state, entry);
    if (outcome === 'correct') {
        await sock.sendMessage(entry.groupId, {
            text: `✅ *AntiBot verification passed:* @${shortJid(entry.jid)} is allowed to stay in the group.`,
            mentions: [entry.jid],
        }).catch(() => {});
        return;
    }

    const meta = await sock.groupMetadata(entry.groupId).catch(() => null);
    const canRemove = botIsAdmin(meta, sock);
    if (entry.mode === 'warn') {
        await sendWarning(sock, entry.groupId, entry.jid,
            `⚠️ *AntiBot warning:* @${shortJid(entry.jid)} did not complete verification.\n_${detail}_\n\nThe member remains because AntiBot is in warn-only mode.`
        );
        return;
    }
    await removeMember(sock, entry.groupId, entry.jid, detail, canRemove);
}

async function issueChallenge(sock, groupId, jid, config, state) {
    const key = pendingKey(groupId, jid);
    if (state.pending.has(key)) return false;
    const groupCount = [...state.pending.values()].filter(entry => entry.groupId === groupId).length;
    if (groupCount >= MAX_PENDING_PER_GROUP) {
        await sock.sendMessage(groupId, { text: '⚠️ AntiBot is busy verifying recent members. Try again shortly.' }).catch(() => {});
        return false;
    }

    const token = crypto.randomBytes(3).toString('hex').toUpperCase();
    const entry = {
        groupId,
        jid,
        token,
        mode: config.antibotMode === 'warn' ? 'warn' : 'kick',
        failures: 0,
        timer: null,
    };
    entry.timer = setTimeout(() => finishChallenge(
        sock,
        state,
        entry,
        'failed',
        'The 60-second verification deadline expired.'
    ).catch(error => console.error('[ANTIBOT] timeout:', error.message)), CHALLENGE_TIMEOUT_MS);
    entry.timer.unref?.();
    state.pending.set(key, entry);

    await sock.sendMessage(groupId, {
        text: `🛡️ *AntiBot verification*\n\n@${shortJid(jid)}, reply with exactly:\n*human ${token}*\n\nYou have 60 seconds. This check is handled by AntiBot and is separate from Guard.`,
        mentions: [jid],
    }).catch(error => console.error('[ANTIBOT] challenge send failed:', error.message));
    return true;
}

async function handleJoin(sock, event) {
    if (!event?.id || event.action !== 'add') return;
    const config = database.getGroup(event.id);
    if (!config.antibot) return;

    const meta = await sock.groupMetadata(event.id).catch(() => null);
    if (!meta) return;
    const canRemove = botIsAdmin(meta, sock);
    if (!canRemove) {
        await sock.sendMessage(event.id, { text: '⚠️ *AntiBot is enabled,* but I need group-admin rights to enforce it.' }).catch(() => {});
    }

    const state = getState(sock);
    for (const raw of event.participants || []) {
        const jid = typeof raw === 'string' ? raw : raw?.id || raw?.jid || raw?.phoneNumber || raw?.lid;
        if (!jid || isBotSelf(sock, jid) || isAdmin(meta, jid)) continue;
        const participant = findParticipant(meta, jid);
        const detection = detectBotSignals({ jid, participant });
        if (detection.highConfidence) {
            if (config.antibotMode === 'warn' || !canRemove) {
                await sendWarning(sock, event.id, jid, `⚠️ *AntiBot:* @${shortJid(jid)} matched ${detection.reason || 'a high-confidence bot signature'}.`);
            } else {
                await removeMember(sock, event.id, jid, detection.reason || 'High-confidence bot signature.', canRemove);
            }
            continue;
        }
        await issueChallenge(sock, event.id, jid, config, state);
    }
}

async function handleMessage(sock, message) {
    const groupId = message?.key?.remoteJid;
    if (!groupId || !groupId.endsWith('@g.us') || message?.key?.fromMe) return;
    const config = database.getGroup(groupId);
    if (!config.antibot) return;

    const jid = messageSender(message);
    if (!jid || isBotSelf(sock, jid)) return;
    const meta = await sock.groupMetadata(groupId).catch(() => null);
    if (isAdmin(meta, jid)) return;
    const state = getState(sock);
    const entry = state.pending.get(pendingKey(groupId, jid));
    if (entry) {
        const text = messageText(message).toLowerCase().replace(/\s+/g, ' ').trim();
        const expected = `human ${entry.token.toLowerCase()}`;
        if (text === expected) {
            await finishChallenge(sock, state, entry, 'correct', '');
            return;
        }
        entry.failures += 1;
        if (entry.failures >= MAX_FAILURES) {
            await finishChallenge(sock, state, entry, 'failed', 'The member sent multiple invalid verification replies.');
        } else {
            await sendWarning(sock, groupId, jid,
                `⚠️ @${shortJid(jid)}, that reply did not match. Reply exactly *human ${entry.token}*. You have one attempt left.`,
            );
        }
        return;
    }

    const detection = detectBotSignals({ jid, participant: findParticipant(meta, jid), messageId: message?.key?.id });
    if (!detection.highConfidence) return;
    const canRemove = botIsAdmin(meta, sock);
    if (config.antibotMode === 'warn' || !canRemove) {
        await sendWarning(sock, groupId, jid, `⚠️ *AntiBot:* @${shortJid(jid)} matched ${detection.reason || 'a high-confidence bot signature'}.`);
    } else {
        await removeMember(sock, groupId, jid, detection.reason || 'High-confidence bot signature.', canRemove);
    }
}

async function challengeGroupMembers(sock, groupId) {
    const config = database.getGroup(groupId);
    if (!config.antibot) return { issued: 0, skipped: 0, total: 0 };
    const meta = await sock.groupMetadata(groupId).catch(() => null);
    if (!botIsAdmin(meta, sock)) throw new Error('bot is not a group admin');
    const state = getState(sock);
    const targets = (meta?.participants || []).filter(participant => {
        const jid = participantIdentifiers(participant)[0];
        return jid && !isBotSelf(sock, jid) && !participant.admin;
    });
    let issued = 0;
    for (const participant of targets) {
        const jid = participantIdentifiers(participant)[0];
        if (await issueChallenge(sock, groupId, jid, config, state)) issued++;
    }
    return { issued, skipped: targets.length - issued, total: targets.length };
}

function isPendingMember(groupId, jid, sock) {
    return Boolean(sock?.__sukunaAntiBotState?.pending?.has(pendingKey(groupId, jid)));
}

function setupAntiBot(sock) {
    if (!sock?.ev?.on || sock.__sukunaAntiBotReady) return;
    sock.__sukunaAntiBotReady = true;
    getState(sock).ready = true;
    sock.ev.on('group-participants.update', event => {
        handleJoin(sock, event).catch(error => console.error('[ANTIBOT JOIN]', error.message));
    });
    sock.ev.on('messages.upsert', batch => {
        for (const message of batch?.messages || []) {
            handleMessage(sock, message).catch(error => console.error('[ANTIBOT MSG]', error.message));
        }
    });
}

module.exports = {
    setupAntiBot,
    challengeGroupMembers,
    isPendingMember,
    handleJoin,
    handleMessage,
};

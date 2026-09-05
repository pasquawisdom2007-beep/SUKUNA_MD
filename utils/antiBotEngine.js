'use strict';

const database = require('./database');
const {
    detectBotSignals,
    findParticipant,
    participantIdentifiers,
    sameIdentity,
    shortJid,
    annotateBotFlags,
} = require('./antiBotSignals');

function normalizeJid(value) {
    return String(value || '').trim().replace(/:\d+(?=@)/, '');
}

function botIdentities(sock) {
    return [sock.user?.id, sock.user?.lid, sock.user?.jid, sock.user?.phoneNumber].filter(Boolean);
}

function isBotSelf(sock, jid) {
    return botIdentities(sock).some(identity => sameIdentity(identity, jid));
}

function botIsAdmin(meta, sock) {
    return !!meta?.participants?.some(participant =>
        participantIdentifiers(participant).some(id => isBotSelf(sock, id)) && Boolean(participant.admin)
    );
}

function isAdmin(meta, jid) {
    return Boolean(findParticipant(meta, jid)?.admin);
}

function getState(sock) {
    if (!sock.__sukunaAntiBotState) sock.__sukunaAntiBotState = { ready: false };
    return sock.__sukunaAntiBotState;
}

function antibotAction(config) {
    const action = String(config?.antibotAction || '').toLowerCase();
    if (['delete', 'kick', 'warn'].includes(action)) return action;
    return config?.antibotMode === 'warn' ? 'warn' : 'kick';
}

async function sendNotice(sock, groupId, jid, text) {
    await sock.sendMessage(groupId, { text, mentions: jid ? [jid] : [] }).catch(() => {});
}

async function deleteMessage(sock, groupId, message) {
    const key = message?.key;
    if (!key?.id) return false;
    try {
        await sock.sendMessage(groupId, { delete: {
            remoteJid: key.remoteJid || groupId,
            fromMe: Boolean(key.fromMe),
            id: key.id,
            participant: key.participant,
        } });
        return true;
    } catch (error) {
        console.error('[ANTIBOT] message deletion failed:', error.message);
        return false;
    }
}

async function removeMember(sock, groupId, jid, reason, canRemove) {
    if (!canRemove) {
        await sendNotice(sock, groupId, jid,
            `⚠️ *AntiBot:* @${shortJid(jid)} matched a bot signature, but I need group-admin rights to remove it.\n_${reason}_`
        );
        return false;
    }
    try {
        await sock.groupParticipantsUpdate(groupId, [jid], 'remove');
        await sendNotice(sock, groupId, jid, `🤖 *AntiBot:* @${shortJid(jid)} was removed.\n_${reason}_`);
        return true;
    } catch (error) {
        console.error('[ANTIBOT] removal failed:', error.message);
        await sendNotice(sock, groupId, jid, `⚠️ *AntiBot:* removal of @${shortJid(jid)} failed. Make me a group admin and try again.`);
        return false;
    }
}

async function enforceDetected(sock, groupId, jid, config, reason, message = null) {
    const meta = await sock.groupMetadata(groupId).catch(() => null);
    const canRemove = botIsAdmin(meta, sock);
    const action = antibotAction(config);

    if (action === 'delete') {
        const deleted = await deleteMessage(sock, groupId, message);
        await sendNotice(sock, groupId, jid, deleted
            ? `🗑️ *AntiBot:* bot message from @${shortJid(jid)} was deleted.\n_${reason}_`
            : `⚠️ *AntiBot:* @${shortJid(jid)} matched a bot signature, but its message could not be deleted.\n_${reason}_`);
        return { action, deleted, removed: false };
    }

    if (action === 'warn') {
        const count = database.addWarning(groupId, jid);
        const max = Math.max(1, Number(config.antibotMaxWarnings) || 3);
        await deleteMessage(sock, groupId, message);
        if (count >= max && canRemove) {
            const removed = await removeMember(sock, groupId, jid, `Warning limit reached (${count}/${max}). ${reason}`, true);
            if (removed) database.resetWarnings(groupId, jid);
            return { action, count, max, removed };
        }
        await sendNotice(sock, groupId, jid,
            `⚠️ *AntiBot warning ${count}/${max}:* @${shortJid(jid)} matched a bot signature.\n_${reason}_` +
            (canRemove ? '' : '\n_The bot needs admin rights before it can remove members._'));
        return { action, count, max, removed: false };
    }

    const removed = await removeMember(sock, groupId, jid, reason, canRemove);
    if (removed) database.resetWarnings(groupId, jid);
    return { action, removed };
}

async function handleJoin(sock, event) {
    if (!event?.id || event.action !== 'add') return;
    const config = database.getGroup(event.id);
    if (!config.antibot) return;
    const meta = await sock.groupMetadata(event.id).catch(() => null);

    for (const raw of event.participants || []) {
        const jid = typeof raw === 'string' ? raw : raw?.id || raw?.jid || raw?.phoneNumber || raw?.lid;
        if (!jid || isBotSelf(sock, jid) || isAdmin(meta, jid)) continue;
        const detection = detectBotSignals({ jid, participant: findParticipant(meta, jid) });
        if (detection.highConfidence) {
            await enforceDetected(sock, event.id, jid, config, detection.reason || 'High-confidence bot signature.');
        }
    }
}

function messageSender(message) {
    return message?.key?.participant || message?.participant || message?.key?.remoteJid || '';
}

async function handleMessage(sock, message) {
    // Mirror the attached framework contract before applying AntiBot policy.
    // This makes `message.isBot` and `message.isBaileys` available to all
    // downstream checks without treating ordinary WhatsApp messages as bots.
    annotateBotFlags(message);
    const groupId = message?.key?.remoteJid;
    if (!groupId || !groupId.endsWith('@g.us') || message?.key?.fromMe) return;
    const config = database.getGroup(groupId);
    if (!config.antibot) return;
    const jid = messageSender(message);
    if (!jid || isBotSelf(sock, jid)) return;
    const meta = await sock.groupMetadata(groupId).catch(() => null);
    if (isAdmin(meta, jid)) return;

    const detection = detectBotSignals({
        jid,
        participant: findParticipant(meta, jid),
        messageId: message?.key?.id,
        message,
    });
    if (detection.highConfidence) {
        await enforceDetected(sock, groupId, jid, config, detection.reason || 'High-confidence bot signature.', message);
    }
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
    handleJoin,
    handleMessage,
};

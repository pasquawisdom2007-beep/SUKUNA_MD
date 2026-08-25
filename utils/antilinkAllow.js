'use strict';

const {
    sameIdentity,
    participantIdentifiers,
    findParticipant,
    shortJid,
} = require('./antiBotSignals');

function getLinkAllowList(group) {
    return Array.isArray(group?.antilinkAllow)
        ? group.antilinkAllow.filter(value => typeof value === 'string' && value.trim())
        : [];
}

function isLinkAllowed(group, jid) {
    if (!jid) return false;
    return getLinkAllowList(group).some(allowed => sameIdentity(allowed, jid));
}

function uniqueIdentities(values) {
    const result = [];
    for (const value of values || []) {
        const jid = String(value || '').trim();
        if (!jid) continue;
        if (!result.some(existing => sameIdentity(existing, jid))) result.push(jid);
    }
    return result;
}

function participantIdentityList(participant) {
    return uniqueIdentities(participantIdentifiers(participant));
}

function resolveParticipant(meta, target) {
    return findParticipant(meta, target);
}

function displayIdentity(jid) {
    return shortJid(jid);
}

module.exports = {
    getLinkAllowList,
    isLinkAllowed,
    uniqueIdentities,
    participantIdentityList,
    resolveParticipant,
    displayIdentity,
};

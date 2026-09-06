/**
 * Bot ID Stamp Detector
 *
 * Some Baileys-lineage forks embed a literal marker string inside every
 * generated message ID (see generics.js's generateMessageIDV2 — itsliaaa's
 * lineage embeds "STARFALL" at a hash-derived position; @pasqua-baileys/baileys
 * embeds "PLOGME" from v2.7.1 onward at a fixed position). A message ID
 * containing one of these strings was built by that specific library — a
 * real WhatsApp client (iOS, Android, Web, Desktop) has no reason to ever
 * produce these substrings, since they aren't part of WhatsApp's own ID
 * format. This is a genuine signature match, not a heuristic.
 *
 * IMPORTANT — what this does NOT do: this only catches bots built on a
 * library that happens to use one of these known stamps. A bot on a
 * different Baileys fork or a non-Baileys WhatsApp automation tool generates
 * IDs with none of these
 * substrings and will NOT be caught by this check. It's a real, solid
 * signal for this specific family of bots — not a universal bot detector,
 * and it should be combined with other signals (like the existing
 * multi-device JID check), not relied on alone.
 */
'use strict';

const KNOWN_BOT_ID_STAMPS = ['STARFALL', 'PLOGME'];

/**
 * @param {string} messageId
 * @returns {string|null} the matched stamp, or null if none matched
 */
function matchedStamp(messageId) {
    const id = String(messageId || '').toUpperCase();
    return KNOWN_BOT_ID_STAMPS.find(stamp => id.includes(stamp)) || null;
}

module.exports = { matchedStamp, KNOWN_BOT_ID_STAMPS };

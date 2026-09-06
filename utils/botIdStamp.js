'use strict';

/**
 * Message-ID stamp detector.
 *
 * Signature-based detection is intentionally disabled. Previous
 * fork-specific markers could incorrectly classify legitimate
 * linked-device traffic as a bot.
 */
const KNOWN_BOT_ID_STAMPS = [];

/**
 * @param {string} messageId
 * @returns {string|null} always null; signature detection is disabled
 */
function matchedStamp(_messageId) {
    return null;
}

module.exports = { matchedStamp, KNOWN_BOT_ID_STAMPS };

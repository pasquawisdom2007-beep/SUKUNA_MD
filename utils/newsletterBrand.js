'use strict';

const NEWSLETTER_JID = process.env.SUKUNA_NEWSLETTER_JID || '120363424109748354@newsletter';
const NEWSLETTER_NAME = process.env.SUKUNA_NEWSLETTER_NAME || 'Sukuna MD Pasqua tech';
const NEWSLETTER_MESSAGE_ID = Number(process.env.SUKUNA_NEWSLETTER_MESSAGE_ID || 143);

const CANONICAL_NEWSLETTER = Object.freeze({
    newsletterJid: NEWSLETTER_JID,
    newsletterName: NEWSLETTER_NAME,
    serverMessageId: NEWSLETTER_MESSAGE_ID,
});

module.exports = {
    NEWSLETTER_JID,
    NEWSLETTER_NAME,
    NEWSLETTER_MESSAGE_ID,
    CANONICAL_NEWSLETTER,
};

/**
 * Pasqua Check — Easter-egg status trigger
 * No prefix, no arguments. Send the exact word "Pasqua!" anywhere
 * and the bot reacts with a chain of 5 emojis, then confirms it's alive.
 */

'use strict';

const fontmakerLib = require('./fontmakerLib');

const TRIGGER = 'pasqua!';
const REACTIONS = ['🔥', '💯', '🗿', '⚡', '👑'];
const REACT_DELAY_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
    name: 'pasquacheck',
    description: 'Reacts and confirms the bot is online when "Pasqua!" is sent',
    category: 'utility',
    isListener: true,

    execute: async (context) => {
        const { sock, msg, from } = context;

        try {
            const bodyText = (
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption ||
                ''
            ).trim();

            if (bodyText.toLowerCase() !== TRIGGER) return;

            // React with a chain of 5 emojis (only the latest shows on WhatsApp,
            // but sending them in sequence gives that "flashing through" effect).
            for (const emoji of REACTIONS) {
                await sock.sendMessage(from, {
                    react: { text: emoji, key: msg.key }
                }).catch(() => {});
                await sleep(REACT_DELAY_MS);
            }

            const coolText = fontmakerLib.convert('All systems up and running boss', 11);

            await sock.sendMessage(from, { text: coolText }, { quoted: msg });
        } catch (err) {
            console.error('[pasquacheck]', err.message);
        }
    }
};

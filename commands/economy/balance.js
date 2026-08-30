/**
 * Balance — show wallet/bank for the user.
 * Fix: previous version used `m.key.remoteJid` but the dispatcher passes
 * `msg`, not `m`. That made `.bal` crash silently. Now uses `from` + `msg`
 * and falls back to plain text if the canvas card fails.
 */
const { economy, CURRENCY, SYMBOL } = require('../../utils/economyManager');

let cloud = null;
try { cloud = require('../../utils/cloudEconomy'); } catch (_) {}

let renderWalletCard = null;
try { ({ renderWalletCard } = require('../../utils/canvasRender')); } catch (_) {}

module.exports = {
    name: 'balance',
    aliases: ['bal', 'wallet', 'money'],
    description: 'Check your PASQUA Bucks balance',
    category: 'economy',

    async execute({ sock, msg, from, sender, reply }) {
        let name = sender.split('@')[0].split(':')[0];
        let wallet = 0, bank = 0, totalEarned = 0, location = 'tokyo';

        // Prefer Lovable Cloud data, fall back to local JSON
        try {
            if (cloud) {
                const wa  = cloud.waNumber(sender);
                const uid = await cloud.getUserIdByWa(wa);
                if (uid) {
                    const [w, ps, prof] = await Promise.all([
                        cloud.getWallet(uid),
                        cloud.getPlayerState(uid),
                        cloud.rest
                            ? cloud.rest(`profiles?id=eq.${uid}&select=display_name`, {}).catch(() => null)
                            : Promise.resolve(null),
                    ]);
                    wallet      = w?.wallet || 0;
                    bank        = w?.bank || 0;
                    totalEarned = w?.total_earned || 0;
                    location    = ps?.location || 'tokyo';
                    if (prof?.[0]?.display_name) name = prof[0].display_name;
                } else {
                    const b = economy.getBalance(sender);
                    wallet = b.wallet; bank = b.bank; totalEarned = b.total;
                }
            } else {
                const b = economy.getBalance(sender);
                wallet = b.wallet; bank = b.bank; totalEarned = b.total;
            }
        } catch (e) {
            console.error('[balance:cloud]', e.message);
            const b = economy.getBalance(sender);
            wallet = b.wallet; bank = b.bank; totalEarned = b.total;
        }

        const num = sender.split('@')[0].split(':')[0];
        const text =
            `${SYMBOL} *Cursed Ledger* — @${num}\n\n` +
            `👛 Wallet : *${wallet.toLocaleString()}*\n` +
            `🏦 Bank   : *${bank.toLocaleString()}*\n` +
            `📈 Earned : *${totalEarned.toLocaleString()}*\n\n` +
            `_${CURRENCY}_`;

        // Economy replies are rendered by the dispatcher as GenAI Rich HTML.
        return reply(text);
    },
};

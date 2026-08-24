/**
 * tikwmBrowser.js — Gets past tikwm.com's Cloudflare Turnstile challenge
 * using a real (headless) Chromium instance, then hands back either a
 * cleared cookie jar (for plain axios calls) or runs the request straight
 * from inside the browser page when the cookie alone isn't trusted enough.
 *
 * Why this exists: tikwm.com serves an interactive Cloudflare "Verify you
 * are human" checkbox — a genuine Turnstile challenge, not a header-based
 * bot check. That can't be passed with axios/fetch; it needs a browser
 * that can actually run Cloudflare's JS and present a real fingerprint.
 *
 * Cost/reliability tradeoffs (be aware of these):
 *   - A headless Chromium instance uses real RAM (100-300MB) while open.
 *     This launches ONE browser and reuses it / its cleared cookie rather
 *     than spinning up a fresh instance per search.
 *   - Cloudflare tunes Turnstile detection over time. This can stop
 *     working with no code change on our end if they tighten the rule.
 *   - The cleared cf_clearance cookie is tied to the IP + fingerprint that
 *     solved it and expires (commonly ~30 min, sometimes less). We cache
 *     it and transparently re-solve when it goes stale.
 */
'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const CHALLENGE_WAIT_MS   = 15000; // how long to give Cloudflare's JS to clear
const COOKIE_TTL_MS       = 20 * 60 * 1000; // treat cf_clearance as stale after this even if not expired yet, to be safe
const BROWSER_IDLE_TTL_MS = 5 * 60 * 1000;  // close the browser if unused for this long, to free RAM

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let _browser        = null;
let _browserIdleAt  = 0;
let _idleCloseTimer = null;
let _cookieCache     = null; // { cookieHeader, userAgent, ts }
let _solvingPromise   = null; // dedupe concurrent solve attempts

// If Chromium can't even launch on this host (missing system libs like
// libatk/libnss — common on minimal panel/container images), retrying that
// launch on every single search is pure waste: each attempt still spins up
// the process, fails, and burns CPU/RAM for nothing. Remember the failure
// and short-circuit for a while instead of hammering a launch we already
// know is broken.
const LAUNCH_FAILURE_COOLDOWN_MS = 60 * 60 * 1000; // re-check hourly in case libs get installed
let _launchBroken   = false;
let _launchBrokenAt = 0;

function scheduleIdleClose() {
    if (_idleCloseTimer) clearTimeout(_idleCloseTimer);
    _idleCloseTimer = setTimeout(async () => {
        if (_browser) {
            try { await _browser.close(); } catch (_) {}
            _browser = null;
            console.log('[tikwmBrowser] closed idle browser to free RAM');
        }
    }, BROWSER_IDLE_TTL_MS);
}

async function getBrowser() {
    if (_launchBroken && (Date.now() - _launchBrokenAt) < LAUNCH_FAILURE_COOLDOWN_MS) {
        throw new Error('Chromium launch is known-broken on this host (missing system libs) — skipping retry until cooldown expires');
    }
    if (_browser && _browser.isConnected()) {
        scheduleIdleClose();
        return _browser;
    }
    try {
        _browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // low-RAM panels often have a tiny /dev/shm; avoid crashing on it
                '--disable-gpu',
                '--single-process', // trims memory further, at some stability cost — acceptable for a short-lived solve
            ],
        });
    } catch (err) {
        _launchBroken   = true;
        _launchBrokenAt = Date.now();
        console.error(`[tikwmBrowser] Chromium failed to launch — marking broken for ${LAUNCH_FAILURE_COOLDOWN_MS / 60000}min: ${err.message.split('\n')[0]}`);
        throw err;
    }
    scheduleIdleClose();
    return _browser;
}

async function solveChallenge() {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto('https://www.tikwm.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Give Cloudflare's JS + stealth plugin time to clear the checkbox
        // automatically. If an actual checkbox is still on screen after a
        // beat, try clicking it — stealth handles most of these silently,
        // but on some runs the widget needs an explicit interaction.
        await sleep(3000);
        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) {
            await checkbox.click({ delay: 100 }).catch(() => {});
        }

        const start = Date.now();
        let cleared = false;
        while (Date.now() - start < CHALLENGE_WAIT_MS) {
            const title = await page.title().catch(() => '');
            if (!/just a moment/i.test(title)) { cleared = true; break; }
            await sleep(500);
        }

        if (!cleared) {
            throw new Error('Cloudflare challenge did not clear within timeout');
        }

        const cookies = await page.cookies();
        const clearance = cookies.find(c => c.name === 'cf_clearance');
        if (!clearance) {
            throw new Error('challenge page cleared but no cf_clearance cookie was set');
        }

        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const userAgent = await page.evaluate(() => navigator.userAgent);

        _cookieCache = { cookieHeader, userAgent, ts: Date.now() };
        console.log('[tikwmBrowser] cleared Cloudflare challenge, cookie cached');
        return _cookieCache;
    } finally {
        await page.close().catch(() => {});
    }
}

/**
 * Returns { cookieHeader, userAgent } that can be dropped straight into
 * axios headers as Cookie / User-Agent. Solves fresh if there's no cached
 * cookie or it's gone stale. Concurrent callers share a single in-flight
 * solve instead of racing to launch multiple browsers.
 */
async function getClearedSession() {
    if (_cookieCache && (Date.now() - _cookieCache.ts) < COOKIE_TTL_MS) {
        return _cookieCache;
    }
    if (_solvingPromise) return _solvingPromise;

    _solvingPromise = solveChallenge().finally(() => { _solvingPromise = null; });
    return _solvingPromise;
}

/** Force-drop the cached cookie, e.g. after a request comes back 403 again. */
function invalidateSession() {
    _cookieCache = null;
}

async function shutdown() {
    if (_idleCloseTimer) clearTimeout(_idleCloseTimer);
    if (_browser) {
        try { await _browser.close(); } catch (_) {}
        _browser = null;
    }
}

module.exports = { getClearedSession, invalidateSession, shutdown };

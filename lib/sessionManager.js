/**
 * Session Manager — Manages multiple WhatsApp sessions
 *
 * FIXES APPLIED:
 *  [1] REMOVED duplicate messages.upsert listener — previously two listeners were
 *      registered on every socket, causing every message to be processed twice,
 *      leaking memory, and eventually stalling sessions under load.
 *
 *  [2] FIXED reconnect reliability — previously, if startSession() threw during a
 *      reconnect attempt (e.g. fetchLatestBaileysVersion() failed due to a brief
 *      network blip), no further retry was ever scheduled and the session died
 *      silently. Now: catch block schedules another retry, and backoff (5s→10s→20s…
 *      capped at 60s, max 20 attempts) prevents hammering WhatsApp servers.
 *
 *  [3] ADDED reconnect deduplication — _reconnectTimers map ensures only one pending
 *      reconnect timer exists per session at a time, preventing concurrent socket
 *      creation for the same number if the close event fires multiple times.
 *
 *  [4] FIXED moderation commands requiring admin — in selfMode, moderation and admin
 *      category commands now pass through for verified group admins, so group admins
 *      can use .warn, .mute, .kick etc. without the bot owner needing to be online.
 *
 *  [5] ADDED isAdmin to command context — all commands now receive isAdmin so they
 *      can make permission decisions without fetching group metadata themselves.
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const pino  = require('pino');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore
} = require('@pasqua-baileys/baileys');

// ── META SECURE LABEL PATCH ──────────────────────────────────────────
// Patch @pasqua-baileys/baileys so secureMetaServiceLabel injects the biz node
// WITHOUT the actual_actors/host_storage/privacy_mode_ts attrs — those attrs
// are what make WhatsApp render the "AI ⬦" mark. The patch replaces the
// getBizBinaryNode export in the loaded module before any session starts.
try {
    const baileysPkg   = require.resolve('@pasqua-baileys/baileys');
    const baileysIndex = require.cache[baileysPkg];
    if (baileysIndex && baileysIndex.exports) {
        const guPath = path.join(
            path.dirname(baileysPkg), 'lib', 'WABinary', 'generic-utils.js'
        );
        const guModule = require.cache[guPath];
        if (guModule && guModule.exports && guModule.exports.getBizBinaryNode) {
            const origGetBiz = guModule.exports.getBizBinaryNode;
            guModule.exports.getBizBinaryNode = (message, addBizAttributes) => {
                // When the secure label is requested WITHOUT the AI payload,
                // force attrs to empty so WhatsApp shows ONLY
                // "This business used a secure service from Meta…"
                if (addBizAttributes && !global.__sukunaAIIcon) {
                    addBizAttributes = true; // keep biz node inclusion
                    // Build our own clean node, bypassing the fork's attrs
                    const node = origGetBiz(message, false);
                    // Preserve quality_control content, drop AI-triggering attrs
                    if (node && node.tag === 'biz') {
                        node.attrs = {};
                    }
                    return node;
                }
                return origGetBiz(message, addBizAttributes);
            };
            console.log('[META-SVC] Fork patched: secure label without AI mark');
        }

        // ── VERIFIED BADGE EXPANSION PATCH ──────────────────────────────
        // The fork's verifiedMe only works on image/video messages. Patch
        // generateWAMessageContent so it applies to ALL media types
        // (image, video, audio, document, sticker, ptv) AND to all menu
        // message formats (buttonsMessage, listMessage, templateMessage,
        // interactiveMessage) — verified badge + AI ⚉ quote fallback.
        const muPath = path.join(
            path.dirname(baileysPkg), 'lib', 'Utils', 'messages.js'
        );
        // The verifiedMe logic lives in generateWAMessageContent (async).
        // The fork only applies it to image/video messages; this patch
        // extends it to ALL media types (image, video, audio, document,
        // sticker, ptv) AND all menu formats (buttons, list, template,
        // interactive, groupStatus, viewOnce envelopes).
        const muModule = require.cache[muPath];
        if (muModule && muModule.exports && muModule.exports.generateWAMessageContent) {
            const origGenContent = muModule.exports.generateWAMessageContent;
            muModule.exports.generateWAMessageContent = async function (message, options) {
                const vfOn = !!global.__sukunaVerified;
                // Flag every outgoing message when verified is toggled ON,
                // so the fork's own verified flow at least runs.
                if (vfOn && message && typeof message === 'object') {
                    message.verifiedMe = true;
                }
                const result = await origGenContent(message, options);
                // The fork's flow silently skips non-(image|video) types,
                // so handle the rest ourselves on the generated content.
                // generateWAMessageContent returns the raw Message proto
                // map (keys like imageMessage, buttonsMessage...).
                if (vfOn && result && typeof result === 'object') {
                    try {
                        const inner = result;
                        const topKey = Object.keys(inner)[0];
                        const isPlainMedia = topKey === 'imageMessage' ||
                            topKey === 'videoMessage' ||
                            topKey === 'audioMessage' ||
                            topKey === 'documentMessage' ||
                            topKey === 'stickerMessage' ||
                            topKey === 'ptvMessage';
                        const isMenuMsg = topKey === 'buttonsMessage' ||
                            topKey === 'listMessage' ||
                            topKey === 'templateMessage' ||
                            topKey === 'interactiveMessage' ||
                            topKey === 'groupStatusMessageV2' ||
                            topKey === 'viewOnceMessage' ||
                            topKey === 'viewOnceMessageV2';
                        if (isPlainMedia || isMenuMsg) {
                            // Resolve the media/menu node (unwrap envelopes)
                            let node = inner[topKey];
                            if (node && typeof node === 'object' && node.message && typeof node.message === 'object') {
                                const wrapped = Object.keys(node.message)[0];
                                node = node.message[wrapped];
                            }
                            const verifiedContext = {
                                isForwarded: true,
                                participant: '0@s.whatsapp.net',
                                remoteJid: '0@s.whatsapp.net'
                            };
                            if (node && typeof node === 'object') {
                                if (node.contextInfo && typeof node.contextInfo === 'object') {
                                    node.contextInfo = { ...node.contextInfo, ...verifiedContext };
                                }
                                else {
                                    node.contextInfo = verifiedContext;
                                }
                            }
                            if (options && !options.quoted) {
                                options.quoted = {
                                    key: {
                                        remoteJid: '0@s.whatsapp.net',
                                        fromMe: false,
                                        participant: '0@s.whatsapp.net',
                                        id: '3EB0' + Math.random().toString(16).substring(2, 10).toUpperCase()
                                    },
                                    message: {
                                        conversation: '```ஃ𖠃 AI ⚉```'
                                    }
                                };
                            }
                        }
                    }
                    catch (normErr) {
                        // Never break the send — verified badge is cosmetic
                        console.error('[META-VERIFIED] badge patch failed:', normErr.message);
                    }
                }
                return result;
            };
            console.log('[META-VERIFIED] Fork patched: verified badge on all media + menu');
        }
    }
} catch (patchErr) {
    console.error('[META-SVC] fork patch failed:', patchErr.message);
}

// WhatsApp may close new-device registration with 405 when the client
// revision is stale (client_too_old) or the WEB browser fingerprint is
// rejected. Resolve the live revision first, then use the maintained fork
// revision as a fallback. The final fallback is only for offline startup.
async function resolveWhatsAppVersion() {
    try {
        const live = await fetchLatestWaWebVersion({
            signal: typeof AbortSignal?.timeout === 'function'
                ? AbortSignal.timeout(10000)
                : undefined,
        });
        if (Array.isArray(live?.version) && live.version.length === 3 && live.isLatest) {
            console.log(`[SESSION] Using live WhatsApp Web version ${live.version.join('.')}`);
            return live.version;
        }
    } catch (error) {
        console.warn(`[SESSION] Live WhatsApp Web version unavailable: ${error.message}`);
    }

    try {
        const maintained = await fetchLatestBaileysVersion();
        if (Array.isArray(maintained?.version) && maintained.version.length === 3) {
            console.log(`[SESSION] Using Baileys-maintained WhatsApp version ${maintained.version.join('.')}`);
            return maintained.version;
        }
    } catch (error) {
        console.warn(`[SESSION] Baileys-maintained version unavailable: ${error.message}`);
    }

    const fallback = [2, 3000, 1040735178];
    console.warn(`[SESSION] Using last-resort WhatsApp version ${fallback.join('.')}`);
    return fallback;
}

const config           = require('../config');
const commandLoader    = require('../utils/commandLoader');
const database         = require('../utils/database');
const antilinkEngine   = require('../utils/antilinkEngine');
const antichannelEngine = require('../utils/antichannelEngine');
const { isLinkAllowed } = require('../utils/antilinkAllow');
const { setupAntiBot, isPendingMember } = require('../utils/antiBotEngine');
const AntiBanEngine    = require('../utils/antiBanEngine');
const fontSystem       = require('../utils/fontSystem');
const langSystem       = require('../utils/langSystem');
const { boxify }       = require('../utils/styleBox');
const groupRecap       = require('../utils/groupRecap');
// const { wrapSocket: brandSocket } = require('../utils/newsletterBrand');
const { setupPromotionGuard } = require('./promotionGuard');
const { setupGuard } = require('./guard');
const { forceGhostPresence } = require('../commands/general/ghostmode');

function extractInteractiveButtonResponse(message) {
    let content = message?.message || {};
    for (let i = 0; i < 8; i += 1) {
        const nested = content?.ephemeralMessage?.message
            || content?.viewOnceMessage?.message
            || content?.viewOnceMessageV2?.message;
        if (!nested) break;
        content = nested;
    }
    const response = content?.interactiveResponseMessage;
    const native = response?.nativeFlowResponseMessage;
    const candidates = [
        native?.paramsJson,
        content?.nativeFlowResponseMessage?.paramsJson,
        response?.body?.text,
        response?.toolCallId,
        response?.tool_call_id,
        content?.toolCallId,
        content?.tool_call_id,
    ].filter(value => value !== undefined && value !== null && value !== '');

    for (const raw of candidates) {
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const id = typeof parsed === 'string'
                ? parsed
                : parsed?.id || parsed?.selected_id || parsed?.button_id || parsed?.buttonId || parsed?.tool_call_id || parsed?.toolCallId;
            if (id) return id;
        } catch (_) {
            // Some clients return the selected GenAI tool ID as plain text.
            if (typeof raw === 'string' && raw.startsWith('chroma:')) return raw;
        }
    }
    return null;
}

function unwrapIncomingMessage(message) {
    let content = message?.message || {};
    for (let i = 0; i < 8; i += 1) {
        const nested = content?.ephemeralMessage?.message
            || content?.viewOnceMessage?.message
            || content?.viewOnceMessageV2?.message
            || content?.viewOnceMessageV2Extension?.message
            || content?.documentWithCaptionMessage?.message;
        if (!nested) break;
        content = nested;
    }
    return content;
}

// ── AI API call ───────────────────────────────────────────────────────────────
const AI_BASE       = 'https://apis.prexzyvilla.site/ai/aichat';
const AI_TIMEOUT_MS = 15000;

function callAI(prompt) {
    return new Promise((resolve, reject) => {
        const url = `${AI_BASE}?prompt=${encodeURIComponent(prompt)}`;
        const req = https.get(url, { timeout: AI_TIMEOUT_MS }, (res) => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(raw);
                    const text =
                        json.reply || json.response || json.answer ||
                        json.text  || json.message  || json.result ||
                        (typeof json === 'string' ? json : null);
                    resolve(text || raw.trim());
                } catch (_) { resolve(raw.trim() || '...'); }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('AI request timed out')); });
        req.on('error', reject);
    });
}

// ── Session Manager ───────────────────────────────────────────────────────────
class SessionManager {
    constructor() {
        this.sessions        = new Map();
        this.ownerJIDCache   = new Map();
        this.lidToPhoneCache = new Map();
        // FIX [2+3]: reconnect deduplication and retry state
        this._reconnectTimers  = new Map(); // phoneNumber → pending timer id
        this._reconnectRetries = new Map(); // phoneNumber → attempt count
        // Anti-delete / anti-edit message cache: groupJid → Map<msgId, msgObj>
        // Capped at 500 messages per group to avoid unbounded memory growth
        this._msgCache = new Map();
        // Prevent duplicate auto-reveals when Baileys redelivers a view-once
        // notify event after reconnects or history synchronization.
        this._viewOnceSeen = new Map();
        // Per-session message-ID guard. Baileys can redeliver notify events
        // after reconnects; command execution must remain once per message.
        this._processedMessages = new Map();
        // Per-session anti-ban engine instances — was missing, causing
        // "Cannot read properties of undefined (reading 'has')" on every startSession()
        this._antiBanEngines = new Map();

        this._startMuteCleanup();
    }

    // ── Periodic cleanup for expired mutes ───────────────────────────────────
    _startMuteCleanup() {
        setInterval(() => {
            try {
                const groups = database.data.groups;
                for (const [groupId, groupData] of Object.entries(groups)) {
                    if (groupData.mutedUsers) {
                        const now = Date.now();
                        let changed = false;
                        for (const [userId, expiresAt] of Object.entries(groupData.mutedUsers)) {
                            if (now > expiresAt) { delete groupData.mutedUsers[userId]; changed = true; }
                        }
                        if (changed) database.setGroup(groupId, 'mutedUsers', groupData.mutedUsers);
                    }
                }
            } catch (e) { console.error('[Mute Cleanup]', e.message); }
        }, 5 * 60 * 1000);
    }

    // ── Owner JID cache helpers ──────────────────────────────────────────────
    _cacheOwnerJID(phoneNumber, jid) {
        if (!jid) return;
        if (!this.ownerJIDCache.has(phoneNumber)) this.ownerJIDCache.set(phoneNumber, new Set());
        const cache = this.ownerJIDCache.get(phoneNumber);
        cache.add(jid);
        const base = jid.split(':')[0] + (jid.includes('@') ? '@' + jid.split('@')[1] : '');
        cache.add(base);
    }

    // Resolve any sender JID (s.whatsapp.net or @lid) to a bare phone-number
    // string. Returns '' when it cannot be resolved (e.g. unknown @lid).
    _resolveSenderPhone(sender, phoneNumber) {
        if (!sender) return '';
        const bare = sender.split(':')[0];
        if (bare.endsWith('@lid')) {
            const map = this.lidToPhoneCache.get(phoneNumber);
            const phone = map?.get(bare);
            return phone ? phone.replace(/\D/g, '') : '';
        }
        return bare.split('@')[0].replace(/\D/g, '');
    }

    // Proactively populate the lid→phone map for a group so we can identify
    // the owner (and other participants) even when they send from a linked
    // device whose participant JID arrives as `<lid>@lid`. Cached per group,
    // refreshed lazily on demand. Safe to call frequently — work is skipped
    // when the requested lid is already known.
    _participantJid(p) {
        if (!p) return '';
        if (typeof p === 'string') return p;
        return p.phoneNumber || p.jid || p.id || p.lid || '';
    }

    _bareJid(jid) {
        const raw = String(jid || '');
        if (!raw) return '';
        const at = raw.indexOf('@');
        if (at === -1) return raw.split(':')[0];
        return raw.slice(0, at).split(':')[0] + raw.slice(at);
    }

    _accessCandidates(phoneNumber, sender) {
        const candidates = new Set();
        const add = (v) => {
            if (!v) return;
            const raw = String(v);
            candidates.add(raw);
            const bare = this._bareJid(raw);
            if (bare) candidates.add(bare);
            const num = this._normJid(raw);
            if (num) {
                candidates.add(num);
                candidates.add(`${num}@s.whatsapp.net`);
            }
        };

        add(sender);

        const bareSender = this._bareJid(sender);
        const map = this.lidToPhoneCache.get(phoneNumber);
        if (bareSender.endsWith('@lid')) add(map?.get(bareSender));

        const senderPhone = this._normJid(sender);
        if (senderPhone && map) {
            for (const [lid, phone] of map.entries()) {
                if (String(phone).replace(/\D/g, '') === senderPhone) add(lid);
            }
        }

        return candidates;
    }

    _isAccessUser(phoneNumber, sender, getter) {
        try {
            const list = typeof database[getter] === 'function' ? database[getter](phoneNumber) : [];
            const candidates = this._accessCandidates(phoneNumber, sender);
            return list.some(jid => {
                const raw = String(jid || '');
                const bare = this._bareJid(raw);
                const num = this._normJid(raw);
                return candidates.has(raw) ||
                    candidates.has(bare) ||
                    (num && candidates.has(num)) ||
                    (num && !bare.endsWith('@lid') && candidates.has(`${num}@s.whatsapp.net`));
            });
        } catch (_) { return false; }
    }

    _isSudoUser(phoneNumber, sender) { return this._isAccessUser(phoneNumber, sender, 'getSudoUsers'); }
    _isModUser(phoneNumber, sender)  { return this._isAccessUser(phoneNumber, sender, 'getModUsers'); }

    async _withTimeout(promise, ms, fallback = null) {
        return Promise.race([
            promise,
            new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
        ]).catch(() => fallback);
    }

    async _ensureLidMap(sock, phoneNumber, groupId, lidNeeded) {
        try {
            if (!groupId || !groupId.endsWith('@g.us')) return;
            if (!this.lidToPhoneCache.has(phoneNumber))
                this.lidToPhoneCache.set(phoneNumber, new Map());
            const map = this.lidToPhoneCache.get(phoneNumber);
            if (lidNeeded && map.has(lidNeeded)) return;

            const meta = await this._withTimeout(sock.groupMetadata(groupId), 3500, null);
            if (!meta) return;
            for (const p of meta.participants) {
                const rawJid = this._participantJid(p);
                const pLid   = p.lid || (p.id?.endsWith?.('@lid') ? p.id : null) || (rawJid.endsWith('@lid') ? rawJid : null);
                const pJid   = p.phoneNumber || (p.id?.endsWith?.('@s.whatsapp.net') ? p.id : null) || (rawJid.endsWith('@s.whatsapp.net') ? rawJid : null);
                const pPhone = (pJid || '').split('@')[0].replace(/\D/g, '');
                if (pLid && pPhone) {
                    map.set(pLid.split(':')[0] + '@lid', pPhone);
                    const ownerNumber = phoneNumber.replace(/\D/g, '');
                    if (pPhone === ownerNumber) {
                        this._cacheOwnerJID(phoneNumber, pLid.split(':')[0] + '@lid');
                    }
                }
            }
        } catch (_) { /* best-effort */ }
    }

    isOwner(fromMe, sender, ownerNumber, phoneNumber) {
        // CRITICAL: Strict owner match per session — no suffix matching, which
        // would leak owner status across paired sessions that happened to share
        // a digit suffix.
        if (fromMe === true) return true;

        const cache = this.ownerJIDCache.get(phoneNumber);
        if (cache && cache.has(sender)) return true;
        if (cache && sender) {
            const bare = sender.split(':')[0];
            if (cache.has(bare)) return true;
        }

        // Resolve the sender — including @lid senders — to a bare phone number
        // so an owner messaging from a linked device (which arrives as
        // `<lid>@lid` instead of their s.whatsapp.net JID) is still recognised.
        const sNum = this._resolveSenderPhone(sender, phoneNumber);
        const oNum = (ownerNumber || phoneNumber || '').replace(/\D/g, '');
        if (!sNum || !oNum) return false;

        if (sNum === oNum) return true;

        try {
            const stored = (database.getOwnerNumber(phoneNumber) || '').replace(/\D/g, '');
            if (stored && sNum === stored) return true;
        } catch (_) {}

        // AUTHORITATIVE OWNER from config / OWNER_NUMBER env — counts as owner
        // across every paired session, in DMs and in groups. This fixes:
        //   • .private in DM locking the owner out of groups
        //   • .setsudo / other owner-only cmds returning "Owner command only"
        //     in groups when the real owner is running them
        try {
            const cfgNum = (config && config.ownerNumber ? String(config.ownerNumber) : '').replace(/\D/g, '');
            if (cfgNum && sNum && sNum === cfgNum) return true;
        } catch (_) {}

        return false;
    }

    // ── Session helpers ──────────────────────────────────────────────────────
    getSessionsFolder(phoneNumber) {
        const folder = path.join(__dirname, '..', config.sessions.folder, phoneNumber);
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        return folder;
    }

    // A failed requestPairingCode() writes `me` and `pairingCode` before the
    // phone actually accepts the link. If that partial state is restored as a
    // fresh pair, Baileys sees `me` and sends a login node instead of a
    // registration node. Only clear this unmistakable pre-pair state; never
    // remove a credential set that contains the successful-pair `account`.
    _hasIncompletePairingState(sessionPath) {
        try {
            const credsFile = path.join(sessionPath, 'creds.json');
            if (!fs.existsSync(credsFile)) return false;
            const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
            return creds?.registered !== true && !creds?.account &&
                !!(creds?.pairingCode || creds?.me?.id);
        } catch (_) {
            return false;
        }
    }

    _clearIncompletePairingState(sessionPath) {
        if (!this._hasIncompletePairingState(sessionPath)) return false;
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            return true;
        } catch (_) {
            return false;
        }
    }

    getAllConnectedSessions() {
        return [...this.sessions.entries()].map(([number, session]) => ({
            number, status: session.status
        }));
    }

    getSession(phoneNumber)  { return this.sessions.get(phoneNumber); }
    isConnected(phoneNumber) {
        const s = this.sessions.get(phoneNumber);
        return s && s.status === 'connected';
    }

    async loadExistingSessions() {
        const root = path.join(__dirname, '..', config.sessions.folder);
        if (!fs.existsSync(root)) return;
        for (const folder of fs.readdirSync(root)) {
            const p = path.join(root, folder);
            if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'creds.json'))) {
                if (this._hasIncompletePairingState(p)) {
                    console.warn(`[PAIR] Ignoring incomplete pairing state for ${folder}; a fresh pairing request is required.`);
                    continue;
                }
                console.log(`[SESSION] Restoring: ${folder}`);
                await this.startSession(folder, false);
            }
        }
    }

    async createSession(phoneNumber) {
        const clean = phoneNumber.replace(/[^0-9]/g, '');
        if (this.isConnected(clean)) return { success: false, error: `${clean} is already connected!` };

        // ── Hard cap: max 20 active sessions ─────────────────────────────────
        const MAX_SESSIONS = 20;
        const activeCount  = [...this.sessions.values()].filter(s => s.status === 'connected').length;
        if (activeCount >= MAX_SESSIONS && !this.sessions.has(clean)) {
            console.log(`[SESSION] ❌ Max sessions (${MAX_SESSIONS}) reached — rejecting ${clean}`);
            return {
                success: false,
                error:   `Server is full (${MAX_SESSIONS}/${MAX_SESSIONS} sessions). Contact the owner.`
            };
        }

        // A stale reconnect timer can otherwise create a second socket while
        // this fresh pairing attempt is being established.
        if (this._reconnectTimers.has(clean)) {
            clearTimeout(this._reconnectTimers.get(clean));
            this._reconnectTimers.delete(clean);
        }
        const old = this.sessions.get(clean);
        if (old?.sock) { try { old.sock.end(); } catch (_) {} }
        this.sessions.delete(clean);
        this._reconnectRetries.delete(clean); // reset retries on fresh pair

        const sessionPath = path.join(__dirname, '..', config.sessions.folder, clean);
        if (this._clearIncompletePairingState(sessionPath)) {
            console.log(`[PAIR] Cleared incomplete pairing state for ${clean}.`);
        }
        return this.startSession(clean, true);
    }

    // ── FIX [2+3]: reliable reconnect with backoff and deduplication ─────────
    _scheduleReconnect(phoneNumber, requestPairing = false) {
        // cancel any already-pending timer for this number
        if (this._reconnectTimers.has(phoneNumber)) {
            clearTimeout(this._reconnectTimers.get(phoneNumber));
            this._reconnectTimers.delete(phoneNumber);
        }

        const retries = this._reconnectRetries.get(phoneNumber) || 0;
        // 24/7 KEEPALIVE: never give up reconnecting as long as the panel/VPS is online.
        // Backoff caps at 60s so we keep retrying forever without hammering WhatsApp.
        const delay = Math.min(5000 * Math.pow(1.5, Math.min(retries, 10)), 60000);
        console.log(`[SESSION] ${phoneNumber}: reconnecting in ${Math.round(delay / 1000)}s (attempt ${retries + 1})`);
        this._reconnectRetries.set(phoneNumber, retries + 1);

        const timer = setTimeout(async () => {
            this._reconnectTimers.delete(phoneNumber);
            try {
                await this.startSession(phoneNumber, requestPairing);
            } catch (err) {
                console.error(`[SESSION] Reconnect threw for ${phoneNumber}:`, err.message);
                // schedule yet another attempt — this handles cases where startSession
                // itself throws before it can register its own retry
                this._scheduleReconnect(phoneNumber, requestPairing);
            }
        }, delay);

        this._reconnectTimers.set(phoneNumber, timer);
    }

    /**
     * Request a pairing code only after the fork has emitted its connecting
     * state. Calling requestPairingCode immediately after makeWASocket() is a
     * race: the fork sends an IQ over the websocket and throws "Connection
     * Closed" when that websocket is not open yet. The documented Baileys
     * flow waits for connection === 'connecting' and then delays briefly.
     */
    async _requestPairingCodeWhenReady(sock, phoneNumber, customCode) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let attempted = false;

            const cleanup = () => {
                sock.ev.off?.('connection.update', onUpdate);
            };

            const fail = error => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error instanceof Error ? error : new Error('Connection closed before pairing code request.'));
            };

            const attempt = async () => {
                if (settled || attempted) return;
                attempted = true;
                try {
                    const code = await sock.requestPairingCode(phoneNumber, customCode);
                    if (settled) return;
                    settled = true;
                    cleanup();
                    resolve(code);
                } catch (error) {
                    fail(error);
                }
            };

            const onUpdate = update => {
                const connection = update?.connection;
                if (connection === 'connecting' && !attempted) {
                    // The fork documents a short readiness delay after the
                    // connecting event. This is required for sendNode to see
                    // the websocket as ready; it is not a pairing-expiry timer.
                    setTimeout(() => attempt().catch(fail), 1500);
                } else if (connection === 'close' && !attempted) {
                    fail(update?.lastDisconnect?.error || new Error('Connection closed before pairing code request.'));
                }
            };

            sock.ev.on('connection.update', onUpdate);
        });
    }

    async startSession(phoneNumber, requestPairing = true) {
        const sessionPath = this.getSessionsFolder(phoneNumber);
        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

            // Direct callers can request a fresh pair even when a prior failed
            // attempt left only `me`/`pairingCode` behind. Remove that partial
            // registration marker before Baileys chooses login vs registration.
            if (requestPairing && !state.creds.registered && !state.creds.account &&
                (state.creds.pairingCode || state.creds.me?.id)) {
                delete state.creds.me;
                delete state.creds.pairingCode;
                delete state.creds.pairingEphemeralKeyPair;
                await saveCreds();
                console.log(`[PAIR] Reset incomplete pairing credentials for ${phoneNumber}.`);
            }

            const version = await resolveWhatsAppVersion();

            const sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                },
                // MacOS is the maintained browser preset that avoids the
                // current WhatsApp 405 rejection of some WEB fingerprints.
                browser: Browsers.macOS('Chrome'),
                markOnlineOnConnect: false,
                syncFullHistory: false,
                retryRequestDelayMs: 3000,
                maxMsgRetryCount: 3,
                getMessage: async () => undefined
            });

            // Brand every outgoing message as forwarded from the channel.
            // try { brandSocket(sock); } catch (e) { console.error('[BRAND]', e.message); }

            // ── GHOST MODE ───────────────────────────────────────────────
            // When enabled for this session, suppress ALL outgoing receipts
            // (delivery + read). Sender will see only a single grey tick ✓,
            // as if the bot is offline. The bot still receives and processes
            // every message normally — we only swallow the receipt stanzas.
            try {
                const _ghostOn = () => {
                    try { return !!database.getGhostMode(phoneNumber); } catch (_) { return false; }
                };
                const _origSendReceipt  = sock.sendReceipt  ? sock.sendReceipt.bind(sock)  : null;
                const _origSendReceipts = sock.sendReceipts ? sock.sendReceipts.bind(sock) : null;
                const _origReadMessages = sock.readMessages ? sock.readMessages.bind(sock) : null;

                if (_origSendReceipt) {
                    sock.sendReceipt = async (...a) => {
                        if (_ghostOn()) return;
                        return _origSendReceipt(...a);
                    };
                }
                if (_origSendReceipts) {
                    sock.sendReceipts = async (...a) => {
                        if (_ghostOn()) return;
                        return _origSendReceipts(...a);
                    };
                }
                if (_origReadMessages) {
                    sock.readMessages = async (...a) => {
                        if (_ghostOn()) return;
                        return _origReadMessages(...a);
                    };
                }
            } catch (e) { console.error('[GHOST] patch failed:', e.message); }

            // ── META SECURE SERVICE LABEL (NO AI MARK) + VERIFIED BADGE ─
            // Toggled via .ss on/off and .verified on/off (owner only).
            // Uses the fork's own `secureMetaServiceLabel` flag — the ONLY
            // path the fork wires into relayMessage's addBizAttributes flow.
            // The "AI ⬦" mark is prevented by the module-level patch above
            // (getBizBinaryNode emits empty biz attrs when the label is on).
            if (global.__sukunaSS === undefined) global.__sukunaSS = false;
            if (global.__sukunaVerified === undefined) global.__sukunaVerified = false;

            // Guard: only wrap ONCE per session (prevents double-wrapping on reconnect)
            if (sock && typeof sock.sendMessage === "function" && !sock.__metaWrapped) {
                const ___origSendMessage = sock.sendMessage.bind(sock);
                sock.__metaWrapped = true;
                sock.sendMessage = async function (_jid, _content, _options) {
                    try {
                        const ssOn = !!global.__sukunaSS;
                        const vfOn = !!global.__sukunaVerified;
                        const secureOn = ssOn || vfOn;
                        const target = typeof _jid === 'string' ? _jid : '';
                        const privateDM = (target.endsWith('@s.whatsapp.net') || target.endsWith('@lid')) &&
                            !target.endsWith('@g.us') && target !== 'status@broadcast';
                        const aiBadgeOn = privateDM && database.getAIBadge();
                        if (aiBadgeOn && _content && typeof _content === "object") {
                            // Pasqua Baileys consumes `ai: true` and renders the
                            // small AI badge on private messages only.
                            _content.ai = true;
                        }
                        if (secureOn && _content && typeof _content === "object") {
                            // The fork's flag: wires into addBizAttributes →
                            // injects the <biz> node that renders the
                            // "This business used a secure service from Meta…"
                            // label (no AI mark, thanks to the patch above).
                            _content.secureMetaServiceLabel = true;
                            // Verified badge: mark the content so the
                            // normalizeWAMessage patch (below) handles
                            // media + menu messages with the badge.
                            if (vfOn) {
                                _content.verifiedMe = true;
                            }
                            // Remove the fork's ai-payload path if ever set
                            // (would force the AI mark + crash in groups).
                            if (!aiBadgeOn) delete _content.ai;
                            if (_content.messageContextInfo) {
                                delete _content.messageContextInfo.supportPayload;
                            }
                            // If messageContextInfo got emptied, remove it too
                            if (_content.messageContextInfo &&
                                Object.keys(_content.messageContextInfo).length === 0) {
                                delete _content.messageContextInfo;
                            }
                        }
                    } catch (wrapErr) {
                        // Metadata is cosmetic; never retry a failed send here.
                        console.error("[META-SVC] content patch failed:", wrapErr.message);
                    }
                    // The outer AntiBanEngine wrapper owns retry/pause behavior.
                    return ___origSendMessage(_jid, _content, _options);
                };
            }

            // Initialize and wire the compliance throttle for this session.
            const antiBanConfig = config.antiBan || {};
            if (!this._antiBanEngines.has(phoneNumber)) {
                this._antiBanEngines.set(phoneNumber, new AntiBanEngine(phoneNumber, antiBanConfig));
            }
            const antiBan = this._antiBanEngines.get(phoneNumber);
            if (antiBanConfig.enabled !== false &&
                sock && typeof sock.sendMessage === 'function' && !sock.__antiBanWrapped) {
                const originalSendMessage = sock.sendMessage.bind(sock);
                const sender = { sendMessage: originalSendMessage };
                sock.__antiBanWrapped = true;
                sock.sendMessage = (_jid, _content, _options) =>
                    antiBan.queueMessage(sender, _jid, _content, _options);
            }

            // Apply the session's setbotlang preference to every normal
            // outbound message, including commands that bypass reply() and
            // send media captions, cards, interactive text, or buttons directly.
            // Translation failures return the original content and never block a
            // command from sending.
            if (sock && typeof sock.sendMessage === 'function' && !sock.__languageWrapped) {
                const localizedSendMessage = sock.sendMessage.bind(sock);
                sock.__languageWrapped = true;
                sock.sendMessage = async (_jid, _content, _options) => {
                    const options = _options && typeof _options === 'object' ? { ..._options } : _options;
                    const alreadyLocalized = !!options?.__sukunaLocalized;
                    if (options && typeof options === 'object') delete options.__sukunaLocalized;
                    try {
                        if (alreadyLocalized) return localizedSendMessage(_jid, _content, options);
                        const language = database.getLanguage(phoneNumber);
                        const localized = await langSystem.localiseOutboundContent(_content, language);
                        return localizedSendMessage(_jid, localized, options);
                    } catch (error) {
                        console.error('[LANG] outbound localization failed:', error.message);
                        return localizedSendMessage(_jid, _content, options);
                    }
                };
            }

            this.sessions.set(phoneNumber, {
                sock,
                status: 'connecting',
                phoneNumber,
                antiBan,
                // Keep the initial-pair socket out of generic reconnect logic.
                // A reconnect without another pairing request cannot produce a
                // usable code and can race the first request.
                pairingPending: requestPairing && !state.creds.registered,
                pairingCodeIssued: false,
            });

            let credentialSave = Promise.resolve();
            const queueCredentialSave = () => {
                credentialSave = credentialSave
                    .catch(() => {})
                    .then(() => saveCreds())
                    .catch(error => {
                        console.error(`[SESSION] Credential save failed for ${phoneNumber}:`, error.message);
                    });
                return credentialSave;
            };

            sock.ev.on('connection.update', async ({ connection, lastDisconnect, isNewLogin }) => {
                if (isNewLogin) {
                    const s = this.sessions.get(phoneNumber);
                    if (s) {
                        s.pairingComplete = true;
                        s.pairingPending = false;
                    }
                    console.log(`[PAIR] WhatsApp accepted pairing for ${phoneNumber}; awaiting restart.`);
                }
                if (connection === 'open') {
                    const s = this.sessions.get(phoneNumber);
                    if (s) {
                        s.status = 'connected';
                        s.pairingPending = false;
                    }
                    this._reconnectRetries.delete(phoneNumber); // reset on success
                    console.log(`[SESSION] Connected: ${phoneNumber}`);

                    // ── 24/7 KEEPALIVE: ping the websocket every 20s so the
                    // connection never goes idle behind NAT/load balancers.
                    if (s) {
                        if (s.keepAliveTimer) clearInterval(s.keepAliveTimer);
                        s.keepAliveTimer = setInterval(() => {
                            try {
                                const ws = sock?.ws;
                                if (ws?.readyState === 1 && typeof ws.ping === 'function') {
                                    ws.ping();
                                }
                            } catch (_) {}
                        }, 20000);
                    }
                    // ── AUTO-ADD: opt-in approval of pending group requests ──
                    if (s) {
                        if (s.autoAddTimer) clearInterval(s.autoAddTimer);
                        let autoAddEnabled = false;
                        try { autoAddEnabled = database.getAutoAdd().enabled === true; } catch (_) {}
                        if (autoAddEnabled) {
                            const { startAutoAddEngine } = require('./autoAddEngine');
                            s.autoAddTimer = startAutoAddEngine(sock);
                        }
                    }
                    // ── AUTO-JOIN: official WhatsApp Channel + Support Group ──
                    // AUTO-JOIN REMOVED: Users are no longer forced to join any channel or group.
                    const sessionDir   = path.join(__dirname, '..', 'sessions', phoneNumber);
                    const welcomedFlag = path.join(sessionDir, '.welcomed');
                    try { fs.mkdirSync(sessionDir, { recursive: true }); } catch (_) {}

                    // ── Welcome DM (image + classy caption) — send ONCE per number ──
                    try {
                        if (fs.existsSync(welcomedFlag)) {
                            // Already greeted on first pairing — skip on every reconnect.
                            throw new Error('__already_welcomed__');
                        }

                        const ownerJid    = `${phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`;
                        const pf          = this.getPrefix(phoneNumber);
                        const creator     = (function(_0xc){return require(Buffer.from(_0xc,'base64').toString('utf8')).name;})('Li9jcmVhdG9y'); // locked
                        const ver         = config.version         || '2.0.0';
                        const tgLink      = 'https://t.me/Pasquaking';
                        const welcomeImg  = path.join(__dirname, '..', 'assets', 'welcome.png');

                        const memMB    = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
                        const totalMB  = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
                        const ramLine  = `${memMB}MB / ${totalMB}MB`;
                        const now      = new Date();
                        const dateStr  = now.toLocaleDateString('en-GB');
                        const timeStr  = now.toLocaleTimeString('en-US', { hour12: true });

                        const caption =
                            `> ┏❐  ⌜ *SUKUNA MD*⌟  ❐ \n` +
                            `> ┃⭔ number  : *+${phoneNumber}*\n` +
                            `> ┃⭔ owner   : ${creator}\n` +
                            `> ┃⭔ prefix  : ${pf || '.'}\n` +
                            `> ┃⭔ version : v${ver}\n` +
                            `> ┃⭔ ram     : ${ramLine}\n` +
                            `> ┃⭔ date    : ${dateStr}\n` +
                            `> ┃⭔ time    : ${timeStr}\n` +
                            `> ┃⭔ status  : online\n` +
                            `> ┃⭔ library : @pasqua-baileys/baileys\n` +
                            `> ┃⭔ credits : pasqua tech\n` +
                            `> ┗❐\n\n` +
                            `> ┏❐  ⌜ *GETTING STARTED*⌟  ❐ \n` +
                            `> ┃⭔ type *${pf || '.'}menu* to see all commands\n` +
                            `> ┃⭔ type *${pf || '.'}setdesign pasqua* for this style\n` +
                            `> ┃⭔ type *${pf || '.'}help* for command help\n` +
                            `> ┃⭔ join us on *t.me/Pasquaking*\n` +
                            `> ┗❐ ┈┈┈┈┈┈┈┈┈┈✧\n` +
                            `> _pasqua md · king of curses_`;

                        if (fs.existsSync(welcomeImg)) {
                            await sock.sendMessage(ownerJid, {
                                image:   { url: welcomeImg },
                                caption
                            });
                        } else {
                            // fallback — no image
                            await sock.sendMessage(ownerJid, { text: caption });
                        }
                        // Persist marker so subsequent reconnects don't re-send.
                        try { fs.mkdirSync(sessionDir, { recursive: true }); fs.writeFileSync(welcomedFlag, String(Date.now())); } catch (_) {}
                    } catch (_) { /* non-fatal or already welcomed */ }
                }
                if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    console.log(`[SESSION] Disconnected: ${phoneNumber} (code: ${code})`);
                    // Clear keepalive on disconnect
                    const sc = this.sessions.get(phoneNumber);
                    if (sc?.keepAliveTimer) { clearInterval(sc.keepAliveTimer); sc.keepAliveTimer = null; }
                    // Ensure the pair-success credential update is persisted
                    // before a 515 close can start the next socket.
                    await credentialSave;

                    // Do not start a reconnect while the first pairing request
                    // is pending. A reconnect path uses requestPairing=false,
                    // so it cannot produce the code the user is waiting for.
                    // `isNewLogin` marks the opposite case: WhatsApp accepted
                    // the code and is now expected to force a 515 restart.
                    const pairingComplete = !!sc?.pairingComplete || !!state.creds.account;
                    if (sc?.pairingPending && !pairingComplete) {
                        sc.status = 'pairing_failed';
                        console.error(`[PAIR] Pairing socket closed before a usable code was returned for ${phoneNumber}.`);
                        return;
                    }
                    // 440 means another WhatsApp Web connection replaced this
                    // session. Reconnecting immediately only creates a second
                    // conflict and makes the panel appear to go offline forever.
                    // Require the duplicate instance to be stopped, then let the
                    // user restart this one deliberately.
                    if (code === DisconnectReason.connectionReplaced || code === 440) {
                        if (sc) sc.status = 'replaced';
                        console.error(`[SESSION] ${phoneNumber} was replaced (440). Stop the other deployment/session, then restart this server.`);
                        return;
                    }
                    // Once pairing is accepted, reconnect as a normal login.
                    // Request another code only when the socket closed after a
                    // code was issued but before WhatsApp accepted it.
                    const shouldPairAgain = !!sc?.pairingCodeIssued &&
                        !pairingComplete && !state.creds.registered;
                    // FIX [LOGOUT-GUARD]: Never permanently delete a session on logout/disconnect.
                    // WhatsApp can send loggedOut codes transiently (e.g. multi-device conflicts,
                    // server restarts, token refresh). Instead of wiping the session, we clear the
                    // saved credentials so a fresh re-pair is triggered on the next reconnect.
                    // This keeps the session slot alive and the panel always shows the number.
                    if (code === DisconnectReason.loggedOut) {
                        console.log(`[SESSION] ⚠️  loggedOut received for ${phoneNumber} — clearing creds and forcing re-pair (session NOT deleted)`);
                        // Wipe just the creds so Baileys treats it as a fresh device on reconnect.
                        // Auth files (app-state, sender-keys) are kept to minimise re-sync time.
                        try {
                            const credsFile = path.join(__dirname, '..', config.sessions.folder, phoneNumber, 'creds.json');
                            if (fs.existsSync(credsFile)) fs.unlinkSync(credsFile);
                        } catch (_) {}
                        if (sc) sc.status = 'reconnecting';
                        this._reconnectRetries.delete(phoneNumber); // reset so backoff starts fresh
                        this._scheduleReconnect(phoneNumber, shouldPairAgain);
                    } else if (config.sessions.autoReconnect) {
                        if (sc) sc.status = 'reconnecting';
                        // 24/7: always reconnect, no max attempts
                        this._scheduleReconnect(phoneNumber, shouldPairAgain);
                    } else {
                        // autoReconnect disabled but we still never want sessions to die silently
                        if (sc) sc.status = 'reconnecting';
                        this._scheduleReconnect(phoneNumber, shouldPairAgain);
                    }
                }
            });

            sock.ev.on('creds.update', queueCredentialSave);

            // ── Real-time Presence Tracking (for .listactive command) ──────────
            sock.ev.on('presence.update', (presences) => {
                try {
                    if (!presences || !Array.isArray(presences)) {
                        return; // Presences not in expected format
                    }
                    
                    for (const { from, presences: presenceList } of presences) {
                        if (!presenceList || !Array.isArray(presenceList)) continue;
                        
                        const presence = presenceList[presenceList.length - 1];
                        if (presence && presence.lastKnownPresence) {
                            // Store presence globally so .listactive can read it
                            global._userPresence = global._userPresence || new Map();
                            global._userPresence.set(from, {
                                state: presence.lastKnownPresence,
                                timestamp: Date.now()
                            });
                        }
                    }
                } catch (e) {
                    // Silently ignore presence tracking errors - not critical
                }
            });

            // ── Setup Promotion Guard (antipromote, antidemote, antihijack) ────
            try {
                setupPromotionGuard(sock);
            } catch (e) {
                console.error('[promotionGuard] setup error:', e.message);
            }
            try {
                setupGuard(sock);
            } catch (e) {
                console.error('[guard] setup error:', e.message);
            }
            try {
                setupAntiBot(sock);
            } catch (e) {
                console.error('[antibot] setup error:', e.message);
            }

            // FIX [1]: only ONE messages.upsert listener.
            // Previously TWO were registered (handleMessages + button handler),
            // causing every message to be processed twice, doubling CPU/memory usage
            // and eventually stalling sessions under sustained load.
            sock.ev.on('messages.upsert', m => {
                // Force ghost presence if enabled
                try {
                    forceGhostPresence(sock);
                } catch (e) {
                    console.error('[ghost mode] force error:', e.message);
                }
                // Continue normal message handling
                return this.handleMessages(sock, phoneNumber, m);
            });

            // ── Anti-Edit & Anti-Delete engine + Retrieve Vault ──────────
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                const { add: retrieveAdd } = require('../utils/retrieveStore');
                const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');

                for (const m of messages) {
                    try {
                        const jid = m.key?.remoteJid;
                        if (!jid) continue;
                        const isGroup = jid.endsWith('@g.us');

                        const grp = isGroup ? database.getGroup(jid) : {};

                        // ── Cache ALL real messages (groups + DMs) for retrieve vault
                        // Protocol / stub messages are meta — skip caching them
                        const isProto = !!m.message?.protocolMessage;
                        const isStub  = !!m.messageStubType;
                        if (!isProto && !isStub && m.message && m.key?.id) {
                            if (!this._msgCache.has(jid)) this._msgCache.set(jid, new Map());
                            const cache = this._msgCache.get(jid);
                            cache.set(m.key.id, m);
                            // Cap at 500 messages per chat
                            if (cache.size > 500) {
                                const first = cache.keys().next().value;
                                cache.delete(first);
                            }
                        }

                        // ── Retrieve Vault: capture deletions silently ────────
                        // protocolMessage type 0 = revoke (delete for everyone)
                        if (isProto && m.message?.protocolMessage?.type === 0) {
                            const proto    = m.message.protocolMessage;
                            const delId    = proto.key?.id;
                            const cache    = this._msgCache.get(jid);
                            const origMsg  = cache?.get(delId);
                            const deleter  = m.key.participant || m.key.remoteJid;
                            const deleterNum = String(deleter).split('@')[0].split(':')[0].replace(/\D/g, '');

                            if (origMsg) {
                                const sender    = origMsg.key?.participant || origMsg.key?.remoteJid;
                                const senderNum = String(sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');

                                // Determine message type and body
                                const om = origMsg.message || {};
                                const textBody =
                                    om.conversation ||
                                    om.extendedTextMessage?.text || null;

                                const mediaTypes = {
                                    imageMessage:    'image',
                                    videoMessage:    'video',
                                    audioMessage:    'audio',
                                    documentMessage: 'document',
                                    stickerMessage:  'sticker',
                                };

                                let entryType    = textBody ? 'text' : 'unknown';
                                let caption      = null;
                                let mimetype     = null;
                                let fileName     = null;
                                let ptt          = false;
                                let mediaBuffer  = null;

                                if (textBody) {
                                    entryType = 'text';
                                } else {
                                    for (const [key, mtype] of Object.entries(mediaTypes)) {
                                        const mediaMsg = om[key];
                                        if (!mediaMsg) continue;
                                        entryType = mtype;
                                        caption   = mediaMsg.caption || null;
                                        mimetype  = mediaMsg.mimetype || null;
                                        fileName  = mediaMsg.fileName || null;
                                        ptt       = !!mediaMsg.ptt;
                                        // Try to download media
                                        try {
                                            const stream = await downloadContentFromMessage(mediaMsg, mtype);
                                            const chunks = [];
                                            for await (const chunk of stream) chunks.push(chunk);
                                            const buf = Buffer.concat(chunks);
                                            if (buf.length > 100) mediaBuffer = buf;
                                        } catch (_) {}
                                        break;
                                    }
                                }

                                if (entryType !== 'unknown') {
                                    retrieveAdd(phoneNumber, {
                                        id:          delId,
                                        jid,
                                        sender:      sender || '',
                                        senderNum,
                                        deleter:     deleter || '',
                                        deleterNum,
                                        type:        entryType,
                                        body:        textBody,
                                        caption,
                                        mimetype,
                                        fileName,
                                        ptt,
                                        mediaBuffer,
                                    });
                                }
                            }
                        }

                        // Skip non-group messages for antidelete/antiedit below
                        if (!isGroup) continue;

                        // ── Anti-Edit ────────────────────────────────────────
                        // Baileys delivers edits as a message with editedMessage wrapper
                        if (grp.antiedit) {
                            const editedWrapper =
                                m.message?.protocolMessage?.type === 14
                                    ? m.message.protocolMessage
                                    : m.message?.editedMessage || null;

                            const editedKey = m.message?.protocolMessage?.key || null;
                            if (editedKey && editedWrapper) {
                                const origId   = editedKey.id;
                                const cache    = this._msgCache.get(jid);
                                const origMsg  = cache?.get(origId);
                                const sender   = m.key.participant || m.key.remoteJid;
                                const senderNum = sender.split('@')[0];

                                // Extract new body
                                const newBody =
                                    editedWrapper.editedMessage?.conversation ||
                                    editedWrapper.editedMessage?.extendedTextMessage?.text ||
                                    editedWrapper.message?.conversation ||
                                    editedWrapper.message?.extendedTextMessage?.text ||
                                    '_(media/unknown)_';

                                // Extract original body
                                const origBody = origMsg
                                    ? (origMsg.message?.conversation ||
                                       origMsg.message?.extendedTextMessage?.text ||
                                       '_(media/unknown)_')
                                    : '_(original not cached)_';

                                const notice =
                                    `✏️ *𝗔𝗡𝗧𝗜-𝗘𝗗𝗜𝗧 𝗔𝗟𝗘𝗥𝗧*\n\n` +
                                    `👤 *Sender:* @${senderNum}\n\n` +
                                    `📌 *Original:*\n${origBody}\n\n` +
                                    `✏️ *Edited to:*\n${newBody}`;

                                await sock.sendMessage(jid, {
                                    text:     notice,
                                    mentions: [sender]
                                });
                            }
                        }

                        // ── Anti-Delete ──────────────────────────────────────
                        // Baileys delivers revocations as protocolMessage type 0
                        if (grp.antidelete) {
                            const proto = m.message?.protocolMessage;
                            if (proto?.type === 0 && proto?.key) {
                                const delId    = proto.key.id;
                                const cache    = this._msgCache.get(jid);
                                const origMsg  = cache?.get(delId);
                                const deleter  = m.key.participant || m.key.remoteJid;
                                const deleterNum = deleter.split('@')[0];

                                if (!origMsg) {
                                    // Message not in cache — send a stub notice
                                    await sock.sendMessage(jid, {
                                        text:     `🗑️ *𝗔𝗡𝗧𝗜-𝗗𝗘𝗟𝗘𝗧𝗘 𝗔𝗟𝗘𝗥𝗧*\n\n` +
                                                  `👤 *@${deleterNum}* deleted a message\n` +
                                                  `_(Message was sent before the bot started — content unavailable)_`,
                                        mentions: [deleter]
                                    });
                                    continue;
                                }

                                const sender    = origMsg.key?.participant || origMsg.key?.remoteJid;
                                const senderNum = (sender || '').split('@')[0];

                                // Try to recover text
                                const body =
                                    origMsg.message?.conversation ||
                                    origMsg.message?.extendedTextMessage?.text || null;

                                const header =
                                    `🗑️ *𝗔𝗡𝗧𝗜-𝗗𝗘𝗟𝗘𝗧𝗘 𝗔𝗟𝗘𝗥𝗧*\n\n` +
                                    `👤 *Deleted by:* @${deleterNum}\n` +
                                    `✉️ *Originally from:* @${senderNum}\n\n`;

                                if (body) {
                                    await sock.sendMessage(jid, {
                                        text:     header + `💬 *Message:*\n${body}`,
                                        mentions: [deleter, sender].filter(Boolean)
                                    });
                                    continue;
                                }

                                // Media recovery
                                const { downloadContentFromMessage } = require('@pasqua-baileys/baileys');
                                const mediaMap = {
                                    imageMessage:    { type: 'image',    key: 'image'    },
                                    videoMessage:    { type: 'video',    key: 'video'    },
                                    audioMessage:    { type: 'audio',    key: 'audio'    },
                                    documentMessage: { type: 'document', key: 'document' },
                                    stickerMessage:  { type: 'sticker',  key: 'sticker'  },
                                };

                                let sent = false;
                                for (const [msgKey, info] of Object.entries(mediaMap)) {
                                    const mediaMsg = origMsg.message?.[msgKey];
                                    if (!mediaMsg) continue;
                                    try {
                                        const stream = await downloadContentFromMessage(mediaMsg, info.type);
                                        const chunks = [];
                                        for await (const chunk of stream) chunks.push(chunk);
                                        const buf = Buffer.concat(chunks);
                                        if (buf.length === 0) continue;

                                        const caption = (mediaMsg.caption || '') ?
                                            header + `📝 *Caption:* ${mediaMsg.caption}` : header;

                                        const payload = { [info.key]: buf, caption };
                                        if (info.type === 'audio') {
                                            payload.mimetype = mediaMsg.mimetype || 'audio/ogg; codecs=opus';
                                            payload.ptt      = !!mediaMsg.ptt;
                                            delete payload.caption;
                                        }
                                        if (info.type === 'document') {
                                            payload.mimetype = mediaMsg.mimetype || 'application/octet-stream';
                                            payload.fileName = mediaMsg.fileName || 'recovered_file';
                                        }

                                        await sock.sendMessage(jid, payload);
                                        // send header as separate text for audio/sticker
                                        if (info.type === 'audio' || info.type === 'sticker') {
                                            await sock.sendMessage(jid, {
                                                text: header,
                                                mentions: [deleter, sender].filter(Boolean)
                                            });
                                        }
                                        sent = true;
                                        break;
                                    } catch (_) {}
                                }

                                if (!sent) {
                                    await sock.sendMessage(jid, {
                                        text:     header + `_(Media could not be recovered)_`,
                                        mentions: [deleter, sender].filter(Boolean)
                                    });
                                }

                                // Remove from cache after recovery
                                this._msgCache.get(jid)?.delete(delId);
                            }
                        }

                    } catch (e) { console.error('[ANTI-EDIT/DELETE]', e.message); }
                }
            });

            // ── Welcome / Goodbye / Introcard — fully handled by eventManager ──
            sock.ev.on('group-participants.update', u => {
                const eventManager = require('./eventManager');
                eventManager.handleGroupParticipantsEvent(sock, phoneNumber, u).catch(e =>
                    console.error('[eventManager] group-participants error:', e.message)
                );
            });

            // ── AntiHijack — handled by sessionManager ────────────────────
            sock.ev.on('group-participants.update', u => {
                this._handleAntiHijack(sock, phoneNumber, u).catch(e =>
                    console.error('[sessionManager] antihijack error:', e.message)
                );
            });

            // ── AntiBot — handled by the independent antiBotEngine ─────────
            sock.ev.on('groups.update', updates => {
                const cache = this._getMetaCache(sock);
                for (const u of updates || []) if (u?.id) cache.delete(u.id);
            });

            // ── No-Call: auto-reject incoming calls instantly ─────────────
            // Handles voice AND video calls, individual AND group calls.
            // Fires for every session independently using its own phoneNumber.
            sock.ev.on('call', async (calls) => {
                for (const call of (calls || [])) {
                    try {
                        // Only handle incoming calls (status: 'offer')
                        if (call.status !== 'offer') continue;

                        // Check if nocall is enabled for this session (DM key = phoneNumber)
                        const callKey = call.isGroup ? call.from : phoneNumber;
                        const blocked = database.getGroup(callKey)?.nocall
                            || database.getGroup(phoneNumber)?.nocall
                            || false;

                        if (!blocked) continue;

                        // Reject the call immediately
                        await sock.rejectCall(call.id, call.from).catch(() => {});

                        // Notify the caller
                        await sock.sendMessage(call.from, {
                            text:
                                '📵 *Calls are currently disabled.*\n\n' +
                                'The bot owner has blocked all incoming calls.\n' +
                                'Please send a text message instead.'
                        }).catch(() => {});

                        console.log(`[NO-CALL] Rejected call from ${call.from} on session ${phoneNumber}`);
                    } catch (e) {
                        console.error('[NO-CALL]', e.message);
                    }
                }
            });


            if (requestPairing && !state.creds.registered) {
                try {
                    const requestedCode = String(config.pairingCode || '').trim().toUpperCase();
                    const customCode = requestedCode.length === 8 ? requestedCode : undefined;
                    if (requestedCode && !customCode) {
                        console.warn('[PAIR] Ignoring custom pairing code: it must be exactly 8 characters.');
                    }
                    const code = await this._requestPairingCodeWhenReady(sock, phoneNumber, customCode);
                    const session = this.sessions.get(phoneNumber);
                    if (session) {
                        // The code is now printed and belongs to this socket.
                        // A later 515 is a post-pair restart, not a pre-code failure.
                        session.pairingPending = false;
                        session.pairingCodeIssued = true;
                    }
                    // Keep the requested custom code exact. Generated codes are
                    // normalized to the usual XXXX-XXXX panel presentation.
                    const raw = String(code || '').replace(/-/g, '');
                    const formatted = customCode === raw
                        ? raw
                        : (raw.match(/.{1,4}/g)?.join('-') || code);
                    return { success: true, code: formatted, phoneNumber };
                } catch (err) {
                    this.sessions.delete(phoneNumber);
                    const status = err?.output?.statusCode || err?.statusCode;
                    const reason = err?.message || 'Pairing request failed.';
                    return {
                        success: false,
                        error: status ? `${reason} (status ${status})` : reason,
                    };
                }
            }
            return { success: true, phoneNumber };

        } catch (err) {
            console.error(`[SESSION] Error starting ${phoneNumber}:`, err.message);
            // FIX [2]: if this was a reconnect attempt that failed (e.g. no network),
            // schedule a retry — previously the session would die here permanently
            if (!requestPairing && config.sessions.autoReconnect) {
                this._scheduleReconnect(phoneNumber);
            }
            return { success: false, error: err.message };
        }
    }

    deleteSession(phoneNumber) {
        // cancel any pending reconnect before deleting
        if (this._reconnectTimers.has(phoneNumber)) {
            clearTimeout(this._reconnectTimers.get(phoneNumber));
            this._reconnectTimers.delete(phoneNumber);
        }
        this._reconnectRetries.delete(phoneNumber);
        const s = this.sessions.get(phoneNumber);
        if (s?.sock) { try { s.sock.end(); } catch (_) {} }
        this.sessions.delete(phoneNumber);
        this.ownerJIDCache.delete(phoneNumber);
        this.lidToPhoneCache.delete(phoneNumber);
        const p = path.join(__dirname, '..', config.sessions.folder, phoneNumber);
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
        console.log(`[SESSION] Deleted: ${phoneNumber}`);
    }

    getPrefix(phoneNumber) {
        const stored = database.getPrefix(phoneNumber);
        if (stored === null) return '';
        if (typeof stored === 'string') return stored;
        return config.prefix || '.';
    }

    // ── Profile picture helper ───────────────────────────────────────────────
    async fetchProfilePicture(sock, jid) {
        try { return await sock.profilePictureUrl(jid, 'image'); } catch (_) { return null; }
    }

    // ── Welcome DM (sent once after a successful pair/link) ──────────────────

    // ── FIX [4+5]: helper — check if a sender is a group admin ───────────────
    async _isGroupAdmin(sock, groupId, sender) {
        try {
            const meta      = await this._withTimeout(sock.groupMetadata(groupId), 3500, null);
            if (!meta) return false;
            const senderNum = this._normJid(this._participantJid(sender));
            return meta.participants.some(p => {
                const pNum = this._normJid(this._participantJid(p));
                const pLid = this._normJid(p.lid || (p.id?.endsWith?.('@lid') ? p.id : ''));
                return (pNum === senderNum || (pLid && pLid === senderNum)) &&
                    (p.admin === 'admin' || p.admin === 'superadmin');
            });
        } catch (_) { return false; }
    }

    // ── Public accessor — look up a previously-seen message by chat + id.
    // Used by commands (e.g. .del) that need the REAL key.fromMe /
    // key.participant of a quoted message instead of guessing, since
    // contextInfo on the quoting message doesn't carry that flag.
    getCachedMessage(jid, id) {
        if (!jid || !id) return null;
        return this._msgCache.get(jid)?.get(id) || null;
    }

    // Auto-recover new view-once media before moderation/command filters can
    // short-circuit the event. The destination is the active paired account's
    // own private chat, never the originating group.
    async _autoRevealViewOnceToOwner(sock, phoneNumber, msg, from, isGroup, fromMe) {
        if (!isGroup || fromMe || !database.getGroup(from).antiviewonce) return false;

        const { extractViewOnce, downloadMedia } = require('../utils/viewOnce');
        const found = extractViewOnce(msg?.message || {});
        if (!found?.mediaType || !found?.mediaMsg) return false;

        const messageId = msg.key?.id;
        const dedupeKey = `${from}:${messageId || ''}`;
        const now = Date.now();
        const seenAt = this._viewOnceSeen.get(dedupeKey);
        if (seenAt && now - seenAt < 5 * 60 * 1000) return true;

        const digits = String(phoneNumber || '').replace(/\D/g, '');
        if (!/^\d{6,20}$/.test(digits)) {
            console.error('[ANTIVIEWONCE] Cannot determine paired private target');
            return false;
        }

        this._viewOnceSeen.set(dedupeKey, now);
        if (this._viewOnceSeen.size > 2000) {
            const oldest = this._viewOnceSeen.keys().next().value;
            this._viewOnceSeen.delete(oldest);
        }

        try {
            const buffer = await downloadMedia(found.mediaMsg, found.mediaType, 3);
            const senderJid = String(msg.key?.participant || msg.participant || 'unknown');
            const senderNumber = senderJid.split('@')[0].split(':')[0];
            const caption =
                `👁️ *VIEW-ONCE RECOVERED PRIVATELY*\\n` +
                `From group: ${from.split('@')[0]}\\n` +
                `Sent by: @${senderNumber}\\n\\n` +
                `> _Sukuna MD · Anti-ViewOnce_`;
            const mentions = senderJid.endsWith('@s.whatsapp.net') ? [senderJid] : [];
            const target = `${digits}@s.whatsapp.net`;

            if (found.mediaType === 'image') {
                await sock.sendMessage(target, { image: buffer, caption, mentions });
            } else if (found.mediaType === 'video') {
                await sock.sendMessage(target, {
                    video: buffer,
                    caption,
                    mentions,
                    mimetype: found.mediaMsg.mimetype || 'video/mp4',
                });
            } else if (found.mediaType === 'audio') {
                await sock.sendMessage(target, {
                    audio: buffer,
                    mimetype: found.mediaMsg.mimetype || 'audio/ogg; codecs=opus',
                    ptt: !!found.mediaMsg.ptt,
                });
                await sock.sendMessage(target, { text: caption, mentions });
            } else if (found.mediaType === 'document') {
                await sock.sendMessage(target, {
                    document: buffer,
                    mimetype: found.mediaMsg.mimetype || 'application/octet-stream',
                    fileName: found.mediaMsg.fileName || 'view-once-file',
                    caption,
                    mentions,
                });
            }
            return true;
        } catch (error) {
            this._viewOnceSeen.delete(dedupeKey);
            console.error('[ANTIVIEWONCE] private recovery failed:', error.message);
            return false;
        }
    }

    // Return true when a notify event has already been accepted for processing.
    // The key is scoped by session and chat so identical message IDs from
    // different accounts or conversations do not collide.
    _isDuplicateMessage(phoneNumber, msg) {
        const messageId = msg?.key?.id;
        if (!messageId) return false;
        if (!this._processedMessages.has(phoneNumber)) {
            this._processedMessages.set(phoneNumber, new Map());
        }
        const processed = this._processedMessages.get(phoneNumber);
        const processedKey = `${msg.key?.remoteJid || ''}:${messageId}`;
        const now = Date.now();
        if (processed.has(processedKey)) return true;
        processed.set(processedKey, now);
        if (processed.size > 2000) {
            const cutoff = now - 15 * 60 * 1000;
            for (const [key, timestamp] of processed) {
                if (timestamp < cutoff) processed.delete(key);
            }
            while (processed.size > 2000) {
                processed.delete(processed.keys().next().value);
            }
        }
        return false;
    }

    // ── Main message handler ─────────────────────────────────────────────────
    async handleMessages(sock, phoneNumber, { messages, type }) {
        if (type !== 'notify') return;

        const prefix      = this.getPrefix(phoneNumber);
        const ownerNumber = phoneNumber.replace(/[^0-9]/g, '');

        for (const msg of messages) {
            try {
                if (!msg.message) continue;

                if (this._isDuplicateMessage(phoneNumber, msg)) continue;

                const fromMe  = !!msg.key.fromMe;
                const from    = msg.key.remoteJid;
                const isGroup = from.endsWith('@g.us');

                // Anti-view-once must run before anti-bot, mute, ban, and
                // command-routing exits. It recovers new group media privately
                // for the active paired account.
                if (await this._autoRevealViewOnceToOwner(sock, phoneNumber, msg, from, isGroup, fromMe)) {
                    continue;
                }

                // Keep a bounded, per-session group transcript for .grouprecap.
                // This is intentionally separate from the retrieve vault and is
                // capped/expired by utils/groupRecap.js.
                if (isGroup) groupRecap.recordMessage(phoneNumber, msg);

                // ── Auto-view + auto-like status ─────────────────────────
                // When enabled, immediately mark every incoming status as
                // read and react ❤️. We bail out of the rest of the pipeline
                // for status messages — they're not commands.
                if (from === 'status@broadcast') {
                    if (!fromMe && database.getAutoViewStatus(phoneNumber)) {
                        try {
                            // FIX [SESSION-ISOLATION]: _seenStatus MUST be keyed per-phoneNumber.
                            // Using a single `this._seenStatus` Map caused sessions to share seen
                            // state — session A would suppress status views that session B already
                            // handled, and status events meant for A could silently be dropped.
                            if (!this._seenStatus) this._seenStatus = new Map();
                            const seen = this._seenStatus;
                            const key = `${phoneNumber}:${msg.key.id}`;
                            if (!seen.has(key)) {
                                seen.set(key, Date.now());
                                // prune old entries (>10min)
                                if (seen.size > 500) {
                                    const cutoff = Date.now() - 10 * 60 * 1000;
                                    for (const [k, t] of seen) if (t < cutoff) seen.delete(k);
                                }
                                await sock.readMessages([msg.key]).catch(() => {});
                                const participant = msg.key.participant || msg.participant;
                                if (participant) {
                                    await sock.sendMessage(
                                        'status@broadcast',
                                        { react: { text: '❤️', key: msg.key } },
                                        { statusJidList: [participant] }
                                    ).catch(() => {});
                                }
                            }
                        } catch (e) {
                            console.error('[AUTO-VIEW STATUS]', e.message);
                        }
                    }

                    // ── Auto-save status (forwards to owner's own DM) ────
                    if (!fromMe && database.getAutoSaveStatus(phoneNumber)) {
                        try {
                            const saver = require('../commands/general/savestatus');
                            const destJid = `${phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`;
                            const participant = msg.key.participant || msg.participant || '';
                            const fromNum = participant.split('@')[0].split(':')[0];
                            const header = `💾 *Auto-Saved Status*${fromNum ? ` from +${fromNum}` : ''}`;
                            await saver._saveQuotedStatus(sock, destJid, msg.message, header).catch(() => {});
                        } catch (e) {
                            console.error('[AUTO-SAVE STATUS]', e.message);
                        }
                    }
                    continue;
                }

                // ── Execute listener commands (auto-triggers like autovv) ───────
                const allCommands = commandLoader.getAll();
                for (const cmd of allCommands) {
                    if (cmd.isListener) {
                        try {
                            const context = { sock, msg, from };
                            await cmd.execute(context);
                        } catch (err) {
                            console.error(`[LISTENER ${cmd.name}]`, err.message);
                        }
                    }
                }


                // ── Auto-Typing / Auto-Recording presence ─────────────────
                // Fire on every incoming message (non-fromMe) so the sender
                // sees "typing..." or "recording audio..." in real-time.
                // phoneNumber == the paired bot number, so this is always
                // correctly scoped to this session's owner settings.
                if (!fromMe) {
                    try {
                        const autoType = database.getAutoTyping(phoneNumber);
                        const autoRec  = database.getAutoRecording(phoneNumber);
                        if (autoType) {
                            await sock.sendPresenceUpdate('composing', from);
                        } else if (autoRec) {
                            await sock.sendPresenceUpdate('recording', from);
                        }
                    } catch (_) { /* presence is best-effort — never crash */ }
                }

                // ── Auto-Read: mark every incoming message as read ───────
                // Covers both group chats and private DMs.
                // Deduplication via a per-session seen-set prevents double-marking
                // on reconnects or message re-deliveries.
                if (!fromMe) {
                    try {
                        if (database.getAutoRead(phoneNumber)) {
                            // Lazy-init a per-phoneNumber seen-set (avoids cross-session leakage)
                            if (!this._autoReadSeen) this._autoReadSeen = new Map();
                            if (!this._autoReadSeen.has(phoneNumber)) this._autoReadSeen.set(phoneNumber, new Map());
                            const readSeen = this._autoReadSeen.get(phoneNumber);

                            const msgId = msg.key?.id;
                            if (msgId && !readSeen.has(msgId)) {
                                readSeen.set(msgId, Date.now());
                                // Keep the seen-set bounded — prune entries older than 15 min
                                if (readSeen.size > 1000) {
                                    const cutoff = Date.now() - 15 * 60 * 1000;
                                    for (const [k, t] of readSeen) if (t < cutoff) readSeen.delete(k);
                                }
                                // FIX: previously this rebuilt the key by hand and hard-coded
                                // fromMe:false, which silently broke group read receipts whenever
                                // msg.key.participant arrived on the newer `@lid` addressing scheme
                                // (WhatsApp drops the receipt instead of erroring). Passing msg.key
                                // straight through — the exact shape WhatsApp itself sent us — is what
                                // the working status auto-view code above already does, and is the
                                // shape sock.readMessages expects. We still resolve @lid → phone JID
                                // first via the same map .private/.setsudo use, so the receipt is sent
                                // for a JID WhatsApp's servers can actually resolve.
                                let keyToRead = msg.key;
                                if (isGroup && msg.key.participant && msg.key.participant.includes('@lid')) {
                                    await this._ensureLidMap(sock, phoneNumber, from, msg.key.participant.split(':')[0]);
                                    const map = this.lidToPhoneCache.get(phoneNumber);
                                    const phone = map?.get(msg.key.participant.split(':')[0]);
                                    if (phone) {
                                        keyToRead = { ...msg.key, participant: `${phone}@s.whatsapp.net` };
                                    }
                                }
                                await sock.readMessages([keyToRead]).catch(() => {});
                            }
                        }
                    } catch (_) { /* autoread is best-effort — never crash the pipeline */ }
                }

                // ── Auto-React: random emoji on every group message ─────
                if (!fromMe && isGroup) {
                    try {
                        const g = database.getGroup(from);
                        if (g && g.autoreact === true) {
                            const EMOJIS = ['❤️','😂','🔥','👍','👎','😮','😢','🙏','👏','💯','🎉','😎','🤔','😅','😍','🥳','🤯','😴','🤡','💀','👀','✨','💔','🙌','🥶','🥵','😇','🤩','🤨','🤤','😋','🤭','😡','🤪','🫡','🫶','💅','🍑','🍆','🌚','🌝','⚡','💎','🏆','🎯','🚀','🎵','🍻','🥂'];
                            const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
                            sock.sendMessage(from, { react: { text: emoji, key: msg.key } }).catch(() => {});
                        }
                    } catch (_) {}
                }



                const sender = fromMe
                    ? `${ownerNumber}@s.whatsapp.net`
                    : (msg.key.participant || msg.key.remoteJid);

                // populate JID cache from every fromMe message
                if (fromMe) {
                    this._cacheOwnerJID(phoneNumber, `${ownerNumber}@s.whatsapp.net`);
                    // FIX: only cache participant JIDs that ACTUALLY belong to
                    // the bot owner. Previously this also cached msg.key.remoteJid
                    // in DMs — which is the *other* party — causing two paired
                    // sessions to treat each other's owners as their own owner.
                    // Mr B's `.menu` in Mr A's DM would then bypass private mode
                    // on Mr A's session and trigger duplicate (spam) replies.
                    if (msg.key.participant) {
                        const pNum = msg.key.participant.split('@')[0].split(':')[0].replace(/\D/g, '');
                        if (pNum === ownerNumber) this._cacheOwnerJID(phoneNumber, msg.key.participant);
                    }
                    if (isGroup && msg.key.participant?.includes('@lid')) {
                        try {
                            const meta = await this._withTimeout(sock.groupMetadata(from), 3500, null);
                            if (!meta) throw new Error('group metadata timeout');
                            if (!this.lidToPhoneCache.has(phoneNumber))
                                this.lidToPhoneCache.set(phoneNumber, new Map());
                            const map = this.lidToPhoneCache.get(phoneNumber);
                            for (const p of meta.participants) {
                                const rawJid = this._participantJid(p);
                                const pLid   = p.lid || (p.id?.endsWith?.('@lid') ? p.id : null) || (rawJid.endsWith('@lid') ? rawJid : null);
                                const pJid   = p.phoneNumber || (p.id?.endsWith?.('@s.whatsapp.net') ? p.id : null) || (rawJid.endsWith('@s.whatsapp.net') ? rawJid : null);
                                const pPhone = (pJid || '').split('@')[0].replace(/\D/g, '');
                                if (pLid && pPhone) {
                                    map.set(pLid.split(':')[0] + '@lid', pPhone);
                                    if (pPhone === ownerNumber) // STRICT — suffix match leaked across sessions
                                        this._cacheOwnerJID(phoneNumber, pLid.split(':')[0] + '@lid');
                                }
                            }
                        } catch (_) {}
                    }
                }

                // WhatsApp increasingly wraps incoming text in ephemeral,
                // view-once, and document-with-caption envelopes. Reading only
                // msg.message directly makes the bot appear connected while
                // silently dropping commands inside those wrappers.
                const messageContent = unwrapIncomingMessage(msg);
                const body =
                    messageContent?.conversation ||
                    messageContent?.extendedTextMessage?.text ||
                    messageContent?.imageMessage?.caption ||
                    messageContent?.videoMessage?.caption ||
                    messageContent?.documentMessage?.caption || '';

                const reply = async (text, opts = {}) => {
                    let localizedText = String(text ?? '');
                    try {
                        localizedText = await langSystem.translateText(
                            localizedText,
                            database.getLanguage(phoneNumber)
                        );
                    } catch (_) {}
                    const fn = database.getFont(phoneNumber);
                    const styled = fontSystem.convert(localizedText, fn);
                    const finalText = opts.raw ? styled : boxify(styled);
                    return sock.sendMessage(
                        from,
                        { text: finalText },
                        { quoted: msg, __sukunaLocalized: true }
                    );
                };

                // If a group participant arrives with an `@lid` JID (which
                // happens for owners messaging from a linked device, and for
                // any participant on the new addressing scheme), make sure the
                // lid→phone map is populated for this group BEFORE we decide
                // owner status. Without this, .private / .setsudo and other
                // owner-gated commands silently fail for the real owner.
                if (isGroup && typeof sender === 'string' && sender.includes('@lid')) {
                    await this._ensureLidMap(sock, phoneNumber, from, sender.split(':')[0]);
                }
                const senderIsOwner = this.isOwner(fromMe, sender, ownerNumber, phoneNumber);

                // AntiBot owns its own sender-bound quarantine. Guard is not
                // involved in this check; the AntiBot listener handles replies
                // and clears the pending state after verification.
                if (isGroup && !fromMe && !senderIsOwner) {
                    try {
                        if (isPendingMember(from, sender, sock)) continue;
                    } catch (_) {}
                }

                // Track per-group activity for .kick inactive, .listactive, .listinactive
                if (isGroup && !fromMe) {
                    try { 
                        database.markSeen(from, sender);
                        database.incrementMessageCount(from, sender);
                    } catch (_) {}
                }

                // ── FIX [1]: handle button responses here (removed the duplicate
                //    messages.upsert listener that used to do this separately) ────
                const buttonResponse =
                    msg.message?.buttonsResponseMessage?.selectedButtonId ||
                    msg.message?.templateButtonReplyMessage?.selectedId ||
                    extractInteractiveButtonResponse(msg);
                if (buttonResponse) {
                    const recapHandled = await groupRecap.handleButton({ sock, msg, from, buttonId: buttonResponse, reply });
                    if (recapHandled) continue;
                    await this.handleButtonResponse(sock, phoneNumber, msg, buttonResponse);
                    continue;
                }

                // ── Muted User Check ─────────────────────────────────────────
                if (isGroup && !senderIsOwner) {
                    try {
                        if (database.isUserMuted(from, sender)) {
                            try {
                                await sock.sendMessage(from, {
                                    delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                });
                            } catch (_) {}
                            continue;
                        }
                    } catch (e) { console.error('[MUTED USER]', e.message); }
                }

                // ── Banned User Check ────────────────────────────────────
                // Globally banned users are silently ignored whenever the bot
                // is in PUBLIC mode (in private mode the existing private-mode
                // guard further down already blocks non-owners). Owners and
                // sudo users can never be silenced this way.
                if (!senderIsOwner) {
                    try {
                        const senderPhone = String(sender).split('@')[0].split(':')[0].replace(/\D/g, '');
                        if (senderPhone && database.isBanned(senderPhone)) {
                            const senderIsSudoBan = this._isSudoUser(phoneNumber, sender);
                            if (!senderIsSudoBan) {
                                continue; // silent ignore
                            }
                        }
                    } catch (e) { console.error('[BAN CHECK]', e.message); }
                }

                // ── SlowMode Enforcement ─────────────────────────────────
                // If .slowmode <secs> is set for this group, each non-admin
                // member must wait that many seconds between messages.
                // Offending messages are silently deleted.
                if (isGroup && !senderIsOwner) {
                    try {
                        const cooldown = Number(database.getGroupData(from, 'slowmode')) || 0;
                        if (cooldown > 0) {
                            let senderIsGroupAdminSM = false;
                            try {
                                const meta = await sock.groupMetadata(from).catch(() => null);
                                if (meta) {
                                    senderIsGroupAdminSM = meta.participants
                                        .some(p => p.id === sender && p.admin);
                                }
                            } catch (_) {}
                            if (!senderIsGroupAdminSM) {
                                if (!sock._slowmodeTracker) sock._slowmodeTracker = new Map();
                                const key = `${from}::${sender}`;
                                const last = sock._slowmodeTracker.get(key) || 0;
                                const now  = Date.now();
                                if (now - last < cooldown * 1000) {
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                        });
                                    } catch (_) {}
                                    continue;
                                }
                                sock._slowmodeTracker.set(key, now);
                            }
                        }
                    } catch (e) { console.error('[SLOWMODE]', e.message); }
                }

                // ── Anti-Spam Enforcement Engine ─────────────────────────
                // Real-time message rate limiter. Tracks each sender's message
                // timestamps in a rolling 10-second window. Admins are exempt.
                // Offences: warn → warn → kick.
                if (isGroup && !senderIsOwner && body) {
                    try {
                        const spamCfg = database.getGroup(from).antispam;
                        const spamOn  = spamCfg?.enabled || spamCfg === true;
                        if (spamOn) {
                            const limit  = (typeof spamCfg === 'object' && spamCfg?.limit) ? spamCfg.limit : 5;
                            const window = 10000; // 10 second rolling window

                            // Check if sender is a group admin — admins are exempt
                            let senderIsGroupAdmin = false;
                            try {
                                const meta = await sock.groupMetadata(from).catch(() => null);
                                if (meta) {
                                    senderIsGroupAdmin = meta.participants
                                        .some(p => p.id === sender && p.admin);
                                }
                            } catch (_) {}

                            if (!senderIsGroupAdmin) {
                                // Initialise per-group spam tracker map on sock if needed
                                if (!sock._spamTracker) sock._spamTracker = new Map();
                                const trackKey = `${from}::${sender}`;
                                const now      = Date.now();

                                // Get or init this sender's record
                                let record = sock._spamTracker.get(trackKey);
                                if (!record) {
                                    record = { timestamps: [], offences: 0 };
                                    sock._spamTracker.set(trackKey, record);
                                }

                                // Prune timestamps outside the rolling window
                                record.timestamps = record.timestamps.filter(t => now - t < window);
                                record.timestamps.push(now);

                                if (record.timestamps.length > limit) {
                                    // Spam detected — delete the offending message
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                        });
                                    } catch (_) {}

                                    record.offences += 1;

                                    if (record.offences === 1) {
                                        await sock.sendMessage(from, {
                                            text: `⚠️ @${sender.split('@')[0]} *Slow down!* You're sending messages too fast.\n\n_Warning 1/2 — next offence will result in removal._`,
                                            mentions: [sender]
                                        });
                                    } else if (record.offences === 2) {
                                        await sock.sendMessage(from, {
                                            text: `⚠️ @${sender.split('@')[0]} *Final warning!* You are spamming.\n\n_One more offence and you will be removed from this group._`,
                                            mentions: [sender]
                                        });
                                    } else {
                                        // 3rd+ offence — kick
                                        try {
                                            await sock.groupParticipantsUpdate(from, [sender], 'remove');
                                            await sock.sendMessage(from, {
                                                text: `🚫 @${sender.split('@')[0]} has been *removed* for spamming.`,
                                                mentions: [sender]
                                            });
                                        } catch (kickErr) {
                                            await sock.sendMessage(from, {
                                                text: `🚫 @${sender.split('@')[0]} *Spam detected!* Please stop sending messages so fast.`,
                                                mentions: [sender]
                                            });
                                        }
                                        // Reset offence count after kick attempt
                                        sock._spamTracker.delete(trackKey);
                                    }
                                    continue; // Don't process the spam message as a command
                                }
                            }
                        }
                    } catch (e) { console.error('[ANTISPAM]', e.message); }
                }

                // ── Anti-Video / Anti-Picture — delete matching media ─────────
                if (isGroup && !senderIsOwner) {
                    try {
                        let incoming = msg.message || {};
                        for (let unwraps = 0; unwraps < 6 && incoming; unwraps += 1) {
                            const nested = incoming.ephemeralMessage?.message
                                || incoming.viewOnceMessage?.message
                                || incoming.viewOnceMessageV2?.message
                                || incoming.viewOnceMessageV2Extension?.message;
                            if (!nested) break;
                            incoming = nested;
                        }
                        const mediaType = incoming.videoMessage ? 'video' : incoming.imageMessage ? 'picture' : null;
                        const groupSettings = database.getGroup(from);
                        const blocked = mediaType === 'video' ? groupSettings.antivideo : mediaType === 'picture' ? groupSettings.antipicture : false;
                        if (mediaType && blocked) {
                            let senderIsGroupAdminAM = false;
                            try {
                                senderIsGroupAdminAM = await this._isGroupAdmin(sock, from, sender);
                            } catch (_) {}
                            if (!senderIsGroupAdminAM) {
                                try {
                                    await sock.sendMessage(from, {
                                        delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                    });
                                } catch (_) {}
                                continue;
                            }
                        }
                    } catch (e) { console.error('[ANTIMEDIA]', e.message); }
                }

                // ── Anti-Sticker — auto-delete EVERY sticker when enabled ─────
                if (isGroup && !senderIsOwner) {
                    try {
                        const sd = msg.message?.stickerMessage;
                        if (sd && database.getGroup(from).antisticker) {
                            // Exempt group admins so mods can still drop reactions/stickers
                            let senderIsGroupAdminAS = false;
                            try {
                                const meta = await sock.groupMetadata(from).catch(() => null);
                                if (meta) {
                                    senderIsGroupAdminAS = meta.participants
                                        .some(p => p.id === sender && p.admin);
                                }
                            } catch (_) {}
                            if (!senderIsGroupAdminAS) {
                                try {
                                    await sock.sendMessage(from, {
                                        delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                    });
                                } catch (_) {}
                                continue;
                            }
                        }
                    } catch (e) { console.error('[ANTISTICKER]', e.message); }
                }

                // ── Blocked Sticker Check ─────────────────────────────────────
                if (isGroup && !senderIsOwner) {
                    try {
                        const sd = msg.message?.stickerMessage;
                        if (sd) {
                            const id = sd.fileSha256 || sd.fileEncSha256;
                            if (id && database.isStickerBlocked(from, Buffer.from(id).toString('base64'))) {
                                try {
                                    await sock.sendMessage(from, {
                                        delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                    });
                                } catch (_) {}
                                continue;
                            }
                        }
                    } catch (e) { console.error('[BLOCKED STICKER]', e.message); }
                }

                // ── Sticker Custom Command Trigger ────────────────────────────
                // When a sticker is sent, check if it has a bound bot command.
                // If it does, execute that command exactly as if the user typed it.
                {
                    const sd = msg.message?.stickerMessage;
                    if (sd) {
                        try {
                            const id = sd.fileSha256 || sd.fileEncSha256;
                            if (id) {
                                const hash       = Buffer.from(id).toString('base64');
                                const boundCmd   = database.getStickerCmd(from, hash);
                                if (boundCmd) {
                                    const stickerCommand = commandLoader.getCommand(boundCmd);
                                    if (stickerCommand) {
                                        // Build a full context and execute the stored command
                                        let senderIsAdmin = senderIsOwner;
                                        if (isGroup && !senderIsOwner) {
                                            senderIsAdmin = await this._isGroupAdmin(sock, from, sender).catch(() => false);
                                        }
                                        const stickerCtx = {
                                            sock, msg, from, sender,
                                            args: [],           // sticker triggers get no args
                                            isGroup,
                                            isWhatsApp: true, isTelegram: false,
                                            phoneNumber, prefix, reply, database,
                                            isOwner: senderIsOwner,
                                            isAdmin: senderIsAdmin,
                                        };
                                        await stickerCommand.execute(stickerCtx);
                                    } else {
                                        // Command was deleted from bot — clean up the stale binding
                                        database.deleteStickerCmd(from, hash);
                                    }
                                    continue;
                                }
                            }
                        } catch (e) { console.error('[STICKER CMD]', e.message); }
                    }
                }

                // ── Mention React + Mention Message ──────────────────────────
                // Checks every group message to see if the owner OR any mod was
                // tagged, then fires their individually configured react/message.
                if (!fromMe && isGroup) {
                    try {
                        const m = msg.message || {};

                        // Extract mentionedJid from every possible message type
                        const mentionCtx =
                            m.extendedTextMessage?.contextInfo ||
                            m.imageMessage?.contextInfo ||
                            m.videoMessage?.contextInfo ||
                            m.audioMessage?.contextInfo ||
                            m.documentMessage?.contextInfo ||
                            m.stickerMessage?.contextInfo ||
                            m.buttonsMessage?.contextInfo ||
                            m.listMessage?.contextInfo ||
                            {};
                        const mentionedJids = mentionCtx.mentionedJid || [];

                        // Quoted/replied-to message — same signal afk.js uses via
                        // checkMentionedAFK (contextInfo.participant = original sender)
                        const quotedParticipant = mentionCtx.participant || null;

                        // ── LID resolution ──────────────────────────────────────
                        // WhatsApp often tags/replies using `<lid>@lid` instead of
                        // the real phone-number JID. Without resolving these, digit
                        // comparisons against ownerPhone/modPhone silently never
                        // match, and DND/mentionmessage/mentionreact just do nothing.
                        // Reuse the same lid→phone cache _ensureLidMap already
                        // builds for owner detection (see isOwner() above).
                        const lidJids = [
                            ...mentionedJids.filter(j => String(j).endsWith('@lid')),
                            ...(quotedParticipant && String(quotedParticipant).endsWith('@lid') ? [quotedParticipant] : []),
                        ];
                        if (lidJids.length) {
                            await this._ensureLidMap(sock, phoneNumber, from, lidJids[0].split(':')[0]);
                        }
                        const lidMap = this.lidToPhoneCache.get(phoneNumber);
                        // Resolve a single jid (lid or phone) to bare phone digits
                        const resolveDigits = (jid) => {
                            const bare = String(jid).split(':')[0];
                            if (bare.endsWith('@lid')) {
                                const phone = lidMap?.get(bare);
                                return phone ? phone.replace(/\D/g, '') : '';
                            }
                            return bare.split('@')[0].replace(/\D/g, '');
                        };
                        const mentionedPhones = new Set(mentionedJids.map(resolveDigits).filter(Boolean));
                        const quotedPhone = quotedParticipant ? resolveDigits(quotedParticipant) : '';

                        // Full text for @number fallback scan
                        const fullText = (
                            body ||
                            m.imageMessage?.caption ||
                            m.videoMessage?.caption ||
                            m.documentMessage?.caption || ''
                        );

                        // Trigger check — explicit @-tag only. Mention React (kept
                        // inline below) uses exactly this. DND/mentionmessage do
                        // their own tag-or-reply check inside their own files.
                        const wasMentioned = (targetPhone) => {
                            const tp = String(targetPhone).replace(/\D/g, '');
                            if (mentionedPhones.has(tp)) return true;
                            // Fallback: raw @number in text
                            if (fullText.includes(`@${tp}`)) return true;
                            return false;
                        };

                        // Senders own phone — skip reacting to yourself
                        const senderPhone = sender.split('@')[0].split(':')[0].replace(/\D/g, '');

                        // ── Check owner ───────────────────────────────────────
                        const ownerPhone = String(ownerNumber).replace(/\D/g, '');

                        // Mention React — narrow trigger only (tag, not reply).
                        // Kept inline/untouched — do not route through dnd.js/mentionmessage.js.
                        if (senderPhone !== ownerPhone && wasMentioned(ownerPhone)) {
                            try {
                                const mReact = database.getMentionReact(phoneNumber, ownerPhone);
                                if (mReact?.enabled && mReact.emoji) {
                                    sock.sendMessage(from, {
                                        react: { text: mReact.emoji, key: msg.key }
                                    }).catch(() => {});
                                }
                            } catch (_) {}
                        }

                        // DND — logic lives in commands/owner/dnd.js (handleDndTag)
                        const dndCmd = commandLoader.getCommand('dnd');
                        if (dndCmd?.handleDndTag) {
                            await dndCmd.handleDndTag(sock, msg, from, {
                                phoneNumber, ownerPhone, senderPhone, sender,
                                mentionedPhones, quotedPhone,
                            });
                        }

                        // Mention Message — logic lives in commands/owner/mentionmessage.js
                        const mentionMsgCmd = commandLoader.getCommand('mentionmessage');
                        if (mentionMsgCmd?.handleMentionMessageTag) {
                            // Owner
                            await mentionMsgCmd.handleMentionMessageTag(sock, msg, from, {
                                phoneNumber, targetPhone: ownerPhone, senderPhone, sender,
                                mentionedPhones, quotedPhone,
                            });
                            // Every mod
                            const modUsers = database.getModUsers(phoneNumber);
                            for (const modJid of modUsers) {
                                const modPhone = String(modJid).split('@')[0].split(':')[0].replace(/\D/g, '');
                                if (!modPhone || modPhone === senderPhone) continue;
                                await mentionMsgCmd.handleMentionMessageTag(sock, msg, from, {
                                    phoneNumber, targetPhone: modPhone, senderPhone, sender,
                                    mentionedPhones, quotedPhone,
                                });
                            }
                        }

                        // Mention React for mods — narrow trigger only (tag, not reply).
                        // Kept inline/untouched — do not route through mentionmessage.js.
                        {
                            const modUsers = database.getModUsers(phoneNumber);
                            for (const modJid of modUsers) {
                                const modPhone = String(modJid).split('@')[0].split(':')[0].replace(/\D/g, '');
                                if (!modPhone || modPhone === senderPhone) continue;
                                if (!wasMentioned(modPhone)) continue;
                                try {
                                    const mReact = database.getMentionReact(phoneNumber, modPhone);
                                    if (mReact?.enabled && mReact.emoji) {
                                        sock.sendMessage(from, {
                                            react: { text: mReact.emoji, key: msg.key }
                                        }).catch(() => {});
                                    }
                                } catch (_) {}
                            }
                        }

                    } catch (e) { console.error('[MENTION-REACT/MSG]', e.message); }
                }

                // ── Anti-Forward enforcement ─────────────────────────────────
                if (isGroup && !senderIsOwner) {
                    try {
                        const grp = database.getGroup(from);
                        if (grp.antiforward) {
                            const ctx =
                                msg.message?.extendedTextMessage?.contextInfo ||
                                msg.message?.imageMessage?.contextInfo ||
                                msg.message?.videoMessage?.contextInfo ||
                                msg.message?.documentMessage?.contextInfo ||
                                msg.message?.stickerMessage?.contextInfo ||
                                msg.message?.audioMessage?.contextInfo ||
                                null;
                            const isForwarded =
                                !!ctx?.isForwarded ||
                                (typeof ctx?.forwardingScore === 'number' && ctx.forwardingScore > 0);
                            if (isForwarded) {
                                let senderIsAdmin = false;
                                try {
                                    const meta = await sock.groupMetadata(from);
                                    const senderNum = sender.split('@')[0].replace(/\D/g, '');
                                    senderIsAdmin = meta.participants.some(p => {
                                        const pNum = p.id.split('@')[0].replace(/\D/g, '');
                                        return pNum === senderNum &&
                                            (p.admin === 'admin' || p.admin === 'superadmin');
                                    });
                                } catch (_) {}
                                if (!senderIsAdmin) {
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                        });
                                    } catch (_) {}
                                    try {
                                        await sock.sendMessage(from, {
                                            text: `📨 @${sender.split('@')[0]} forwarded messages are not allowed here.`,
                                            mentions: [sender]
                                        });
                                    } catch (_) {}
                                    continue;
                                }
                            }
                        }
                    } catch (e) { console.error('[ANTIFORWARD]', e.message); }
                }

                // ── Blacklist word enforcement ───────────────────────────────
                if (isGroup && !senderIsOwner && body) {
                    try {
                        const list = database.getGroup(from).blacklist || [];
                        if (list.length) {
                            const lower = body.toLowerCase();
                            const hit = list.find(w => {
                                if (!w) return false;
                                const safe = String(w).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                return new RegExp(`\\b${safe}\\b`, 'i').test(lower);
                            });
                            if (hit) {
                                let senderIsAdmin = false;
                                try {
                                    const meta = await sock.groupMetadata(from);
                                    const senderNum = sender.split('@')[0].replace(/\D/g, '');
                                    senderIsAdmin = meta.participants.some(p => {
                                        const pNum = p.id.split('@')[0].replace(/\D/g, '');
                                        return pNum === senderNum &&
                                            (p.admin === 'admin' || p.admin === 'superadmin');
                                    });
                                } catch (_) {}
                                if (!senderIsAdmin) {
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                        });
                                    } catch (_) {}
                                    try {
                                        await sock.sendMessage(from, {
                                            text: `🚫 @${sender.split('@')[0]} that word is blacklisted in this group.`,
                                            mentions: [sender]
                                        });
                                    } catch (_) {}
                                    continue;
                                }
                            }
                        }
                    } catch (e) { console.error('[BLACKLIST]', e.message); }
                }

                // ── Anti-Channel Enforcement ──────────────────────────────────
                // Channel protection is deliberately checked before generic
                // antilink. It catches both visible channel URLs and the hidden
                // newsletter/View Channel metadata used by rich previews.
                if (isGroup && !senderIsOwner) {
                    try {
                        const grp = database.getGroup(from);
                        if (grp.antichannel) {
                            let senderIsAdmin = false;
                            try {
                                const meta      = await sock.groupMetadata(from);
                                const senderNum = sender.split('@')[0].replace(/\D/g, '');
                                senderIsAdmin   = meta.participants.some(p => {
                                    const ids = [p.id, p.jid, p.phoneNumber, p.lid].filter(Boolean);
                                    return ids.some(id => id.split('@')[0].split(':')[0].replace(/\D/g, '') === senderNum) &&
                                        (p.admin === 'admin' || p.admin === 'superadmin');
                                });
                            } catch (_) {}

                            if (!senderIsAdmin) {
                                const detection = antichannelEngine.detectChannelMessage(msg, body);
                                if (detection.hasChannel) {
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                        });
                                    } catch (_) {}
                                    console.log(`[ANTICHANNEL] Removed ${detection.reason || 'channel content'} from ${from}`);
                                    continue;
                                }
                            }
                        }
                    } catch (e) { console.error('[ANTICHANNEL]', e.message); }
                }

                // ── Robust Anti-Link Enforcement ─────────────────────────────
                if (isGroup && !senderIsOwner && body) {
                    try {
                        const grp = database.getGroup(from);
                        if (grp.antilink) {
                            let senderIsAdmin = false;
                            try {
                                const meta      = await sock.groupMetadata(from);
                                const senderNum = sender.split('@')[0].replace(/\D/g, '');
                                senderIsAdmin   = meta.participants.some(p => {
                                    const pNum = p.id.split('@')[0].replace(/\D/g, '');
                                    return pNum === senderNum &&
                                        (p.admin === 'admin' || p.admin === 'superadmin');
                                });
                            } catch (_) {}

                            const senderIsLinkAllowed = isLinkAllowed(grp, sender);
                            if (!senderIsAdmin && !senderIsLinkAllowed) {
                                const detection = antilinkEngine.detect(body);
                                if (detection.hasLink) {
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                        });
                                    } catch (_) {}

                                    const num  = sender.split('@')[0];
                                    const mode = grp.antilinkMode || 'normal';

                                    if (mode === 'strict') {
                                        const action = grp.antilinkAction || 'kick';
                                        await sock.sendMessage(from, {
                                            text: `🚫 @${num} Link detected in strict mode!\nAction: ${action.toUpperCase()}`,
                                            mentions: [sender]
                                        });
                                        if (action === 'kick') {
                                            try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch (_) {}
                                        } else if (action === 'mute') {
                                            database.setMutedUser(from, sender, Date.now() + 3600000);
                                            await sock.sendMessage(from, { text: `🔇 @${num} has been muted for 1 hour!`, mentions: [sender] });
                                        }
                                        continue;
                                    }

                                    const warnings    = database.addAntiLinkWarning(from, sender);
                                    const maxWarnings = grp.antilinkMaxWarnings || 3;
                                    const action      = grp.antilinkAction || 'mute';
                                    if (warnings >= maxWarnings) {
                                        if (action === 'kick') {
                                            await sock.sendMessage(from, {
                                                text: `🚫 @${num} has been kicked for repeated link violations!\n(Max warnings: ${maxWarnings})`,
                                                mentions: [sender]
                                            });
                                            try {
                                                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                                                database.resetAntiLinkWarnings(from, sender);
                                            } catch (_) {}
                                        } else if (action === 'mute') {
                                            database.setMutedUser(from, sender, Date.now() + 1800000);
                                            await sock.sendMessage(from, {
                                                text: `🔇 @${num} has been muted for 30 minutes!\n(Max warnings: ${maxWarnings})`,
                                                mentions: [sender]
                                            });
                                            database.resetAntiLinkWarnings(from, sender);
                                        } else {
                                            await sock.sendMessage(from, {
                                                text: `⚠️ @${num} Links are not allowed!\nWarning: ${warnings}/${maxWarnings}`,
                                                mentions: [sender]
                                            });
                                        }
                                    } else {
                                        await sock.sendMessage(from, {
                                            text: `⚠️ @${num} Links are not allowed in this group!\nWarning: ${warnings}/${maxWarnings}\n\nType detected: ${detection.type}`,
                                            mentions: [sender]
                                        });
                                    }
                                    continue;
                                }
                            }
                        }
                    } catch (e) { console.error('[ANTILINK]', e.message); }
                }

                // ── Anti-Mention enforcement ──────────────────────────────────
                if (isGroup && !senderIsOwner && body) {
                    try {
                        const grp = database.getGroup(from);
                        if (grp.antimention) {
                            let senderIsAdmin = false;
                            try {
                                const meta      = await sock.groupMetadata(from);
                                const senderNum = sender.split('@')[0].replace(/\D/g, '');
                                senderIsAdmin   = meta.participants.some(p => {
                                    const pNum = p.id.split('@')[0].replace(/\D/g, '');
                                    return pNum === senderNum &&
                                        (p.admin === 'admin' || p.admin === 'superadmin');
                                });
                            } catch (_) {}

                            if (!senderIsAdmin) {
                                const hasEveryone     = /@everyone/i.test(body);
                                const hasAdmins       = /@admins?/i.test(body);
                                const mentionCount    = (body.match(/@\d+/g) || []).length;
                                const hasMassMentions = mentionCount >= (grp.antimentionMax || 5);
                                const mentions        = body.match(/@\d+/g) || [];
                                const hasSpamTagging  = mentions.length > [...new Set(mentions)].length * 2;

                                if (hasEveryone || hasAdmins || hasMassMentions || hasSpamTagging) {
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                        });
                                    } catch (_) {}

                                    const num           = sender.split('@')[0];
                                    const violationType = hasEveryone ? '@everyone' :
                                                         hasAdmins ? '@admins' :
                                                         hasMassMentions ? `mass mentions (${mentionCount})` :
                                                         'spam tagging';
                                    const warnings    = database.addAntiMentionWarning(from, sender);
                                    const maxWarnings = grp.antimentionMode === 'strict' ? 2 : 3;

                                    if (grp.antimentionMode === 'strict' && warnings >= maxWarnings) {
                                        await sock.sendMessage(from, {
                                            text: `🚫 @${num} has been kicked for repeated mention violations!`,
                                            mentions: [sender]
                                        });
                                        try {
                                            await sock.groupParticipantsUpdate(from, [sender], 'remove');
                                            database.resetAntiMentionWarnings(from, sender);
                                        } catch (_) {}
                                    } else {
                                        await sock.sendMessage(from, {
                                            text: `⚠️ @${num} ${violationType} is not allowed!\nWarning: ${warnings}/${maxWarnings}`,
                                            mentions: [sender]
                                        });
                                    }
                                    continue;
                                }
                            }
                        }
                    } catch (e) { console.error('[ANTIMENTION]', e.message); }
                }

                // ── Anti-Group-Mention enforcement ───────────────────────────
                // Detects WhatsApp's "group status mention" / "@group" / "@everyone"
                // wide-broadcast tags and silently deletes them (admins exempt).
                if (isGroup && !senderIsOwner) {
                    try {
                        const grp = database.getGroup(from);
                        if (grp.antigroupmention) {
                            // collect contextInfo across message types
                            const m = msg.message || {};
                            const ctxAGM =
                                m.extendedTextMessage?.contextInfo ||
                                m.imageMessage?.contextInfo ||
                                m.videoMessage?.contextInfo ||
                                m.audioMessage?.contextInfo ||
                                m.documentMessage?.contextInfo ||
                                m.stickerMessage?.contextInfo ||
                                {};
                            const txt = (body || '') + ' ' + (m.imageMessage?.caption || m.videoMessage?.caption || '');

                            // Signals that this is a group-wide / status-style mention:
                            const isStatusMention =
                                !!m.groupStatusMentionMessage ||
                                !!m.statusMentionMessage ||
                                !!m.groupMentionedMessage ||
                                (Array.isArray(ctxAGM.groupMentions) && ctxAGM.groupMentions.length > 0) ||
                                !!ctxAGM.isSampled ||
                                ctxAGM.mentionedJid?.some?.(j => String(j).endsWith('@g.us'));
                            const hasEveryone = /@everyone\b/i.test(txt);
                            const hasGroupTag = /@group\b/i.test(txt);
                            // mass-mention threshold: 8+ unique @ tags fired at once
                            const mentionList = ctxAGM.mentionedJid || [];
                            const uniqueMentions = new Set(mentionList.map(j => this._normJid(j))).size;
                            const isMass = uniqueMentions >= 8;

                            if (isStatusMention || hasEveryone || hasGroupTag || isMass) {
                                // exempt admins
                                let senderIsAdmin = false;
                                try {
                                    const meta = await sock.groupMetadata(from);
                                    const senderNum = this._normJid(sender);
                                    senderIsAdmin = meta.participants.some(p => {
                                        const pNum = this._normJid(p.id);
                                        const pLid = this._normJid(p.lid);
                                        return (pNum === senderNum || (pLid && pLid === senderNum)) &&
                                               (p.admin === 'admin' || p.admin === 'superadmin');
                                    });
                                } catch (_) {}

                                if (!senderIsAdmin) {
                                    // bump counter
                                    try {
                                        const cur = grp.antigroupmentionViolations || 0;
                                        database.setGroup(from, 'antigroupmentionViolations', cur + 1);
                                    } catch (_) {}

                                    // silent delete
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: sender }
                                        });
                                    } catch (_) {}

                                    // optional kick action
                                    if (grp.antigroupmentionAction === 'kick') {
                                        try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch (_) {}
                                    }
                                    continue;
                                }
                            }
                        }
                    } catch (e) { console.error('[ANTIGROUPMENTION]', e.message); }
                }

                // ── Anti-Group-Status enforcement ────────────────────────────
                // Group status posts (Updates tab) arrive on the GROUP JID with
                // msg.message.groupStatusMessageV2 set. We delete the status post
                // via a protocol revoke targeting the exact message key, and
                // optionally kick the poster. Admins are always exempt.
                if (isGroup && !fromMe && !senderIsOwner) {
                    try {
                        const grpAGS = database.getGroup(from);
                        const agsMode = grpAGS.antigroupstatus; // 'on' | 'kick' | false
                        if (agsMode && agsMode !== false) {
                            const rawMsg = msg.message || {};

                            // groupStatusMessageV2 is set when someone posts to the
                            // group status/Updates feed — this is what we intercept.
                            const isGroupStatusPost = !!rawMsg.groupStatusMessageV2;

                            if (isGroupStatusPost) {
                                // Admins are always exempt
                                let senderIsGroupAdmin = false;
                                try {
                                    const meta = await sock.groupMetadata(from);
                                    const senderNum = this._normJid(sender);
                                    senderIsGroupAdmin = meta.participants.some(p => {
                                        const pNum = this._normJid(p.id);
                                        const pLid = this._normJid(p.lid || '');
                                        return (pNum === senderNum || (pLid && pLid === senderNum)) &&
                                               (p.admin === 'admin' || p.admin === 'superadmin');
                                    });
                                } catch (_) {}

                                if (!senderIsGroupAdmin) {
                                    // Revoke the group status post.
                                    // Must use the exact key with participant set.
                                    const statusKey = {
                                        remoteJid:   from,
                                        fromMe:      false,
                                        id:          msg.key.id,
                                        participant: sender,
                                    };

                                    // Helper: sleep to give WhatsApp time to process delete before kick
                                    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

                                    // ── DELETE (all three methods, in sequence) ──────────────
                                    // Attempt 1: standard delete (protocolMessage REVOKE)
                                    let deleted = false;
                                    try {
                                        await sock.sendMessage(from, { delete: statusKey });
                                        deleted = true;
                                    } catch (_) {}

                                    // Attempt 2: direct groupRevokeStatus if available
                                    try {
                                        if (typeof sock.groupRevokeStatus === 'function') {
                                            await sock.groupRevokeStatus(from, msg.key.id);
                                            deleted = true;
                                        }
                                    } catch (_) {}

                                    // Attempt 3: explicit protocolMessage type 0 REVOKE
                                    if (!deleted) {
                                        try {
                                            await sock.sendMessage(from, {
                                                protocolMessage: {
                                                    key: statusKey,
                                                    type: 0, // REVOKE
                                                },
                                            });
                                        } catch (_) {}
                                    }

                                    // Attempt 4: sendMessage with delete key using fromMe=true
                                    // (some Baileys forks require fromMe:true for group status revoke)
                                    try {
                                        await sock.sendMessage(from, {
                                            delete: { ...statusKey, fromMe: true },
                                        });
                                    } catch (_) {}

                                    // ── KICK (only after delete has had time to process) ──────
                                    if (agsMode === 'kick') {
                                        // Wait 800ms so the delete is processed before the participant
                                        // is removed (avoids race where kick happens before revoke)
                                        await sleep(800);
                                        try {
                                            await sock.groupParticipantsUpdate(from, [sender], 'remove');
                                        } catch (_) {}
                                    }

                                    continue; // skip rest of pipeline
                                }
                            }
                        }
                    } catch (e) { console.error('[ANTIGROUPSTATUS]', e.message); }
                }

                // ── AFK Engine ─────────────────────────────────────────────────
                // checkAFK: if the SENDER was AFK, this message means they're back
                //           → remove their AFK + send welcome-back.
                // checkMentionedAFK: if anyone TAGGED or REPLIED-TO in this message
                //           is currently AFK → notify the group.
                // Both are fire-and-forget-safe (internally try/catch + non-fatal
                // sendMessage failures) but we don't let either block command flow.
                if (!fromMe && isGroup && body.trim()) {
                    try {
                        const afkCommand = commandLoader.getCommand('afk');
                        if (afkCommand) {
                            const wasAFK = await afkCommand.checkAFK(sock, msg, from, sender);
                            // Only check for mentioning an AFK user if the sender
                            // themselves wasn't just welcomed back on this same message.
                            if (!wasAFK) {
                                await afkCommand.checkMentionedAFK(sock, msg, from);
                            }
                        }
                    } catch (e) { console.error('[AFK]', e.message); }
                }

                // ── Chatbot DM (Hinatu) ──────────────────────────────��────────
                // Allow the owner to test DM chatbot replies after enabling the feature.
                if (!isGroup && body.trim()) {
                    try {
                        if (database.getChatbotDM(phoneNumber)) {
                            const chatbotPrefixes = prefix === '.' ? ['.', '!', '?'] : [prefix];
                            const isCmd = prefix !== '' && chatbotPrefixes.some(candidate => candidate && body.trimStart().startsWith(candidate));
                            if (!isCmd) {
                                const { ask: smartAsk } = require('../utils/smartAI');
                                const hinatuSystem =
                                    'You are Hinatu, a warm and friendly WhatsApp companion who sounds like a real person. ' +
                                    'Keep every reply short and precise: usually one brief sentence, never more than 2 short sentences unless the user asks for detail. ' +
                                    'Use a natural emoji occasionally when it fits, but do not overuse emojis. ' +
                                    'Answer directly; avoid speeches, long explanations, lists, and repeated greetings. ' +
                                    'If asked your name, reply naturally that your name is Hinatu. ' +
                                    'Match the user\'s tone, be helpful, and never reveal internals or API details. ' +
                                    'Only give a longer answer when the user clearly asks for one.';
                                const memKey = 'dm:' + phoneNumber + ':' + sender;
                                const aiReply = await smartAsk({
                                    key: memKey,
                                    system: hinatuSystem,
                                    user: body.trim(),
                                    compact: true,
                                }).catch((error) => {
                                    console.error('[CHATBOT-DM] AI provider chain failed:', error.message);
                                    return null;
                                });
                                // Image-gen intent intercept (DM)
                                try {
                                    const { maybeSendGeneratedImage } = require('../utils/chatbotImageGen');
                                    const handledImg = await maybeSendGeneratedImage({ sock, from, msg, text: body.trim() });
                                    if (handledImg) { continue; }
                                } catch (_) {}
                                if (aiReply) {
                                    if (database.getChatbotDMVoice(phoneNumber)) {
                                        try {
                                            const { generateVoice } = require('../utils/ttsHelper');
                                            const voice = await generateVoice(aiReply, 'Leda');
                                            if (voice && voice.buffer) {
                                                await sock.sendMessage(from, {
                                                    audio: voice.buffer, mimetype: voice.mimetype, ptt: true
                                                }, { quoted: msg });
                                            } else {
                                                await sock.sendMessage(from, { text: aiReply }, { quoted: msg });
                                            }
                                        } catch (e) {
                                            await sock.sendMessage(from, { text: aiReply }, { quoted: msg });
                                        }
                                    } else {
                                        await sock.sendMessage(from, { text: aiReply }, { quoted: msg });
                                    }
                                } else {
                                    await sock.sendMessage(from, {
                                        text: '⚠️ The chatbot is enabled, but all AI providers are temporarily unavailable. Please try again shortly.',
                                    }, { quoted: msg });
                                }
                                continue;
                            }
                        }
                    } catch (e) { console.error('[CHATBOT-DM]', e.message); }
                }

                // ── Neuro Self-Evolving AI Core (JARVIS v5.0) ──────────────────
                if (database.getNeuro(phoneNumber) && body.trim()) {
                    try {
                        const botIds = this._botIds(sock);
                        const ctxN = msg.message?.extendedTextMessage?.contextInfo || {};
                        const mentioned = (ctxN.mentionedJid || []).some(j => botIds.has(this._normJid(j)));
                        const repliedToBot = botIds.has(this._normJid(ctxN.participant));
                        
                        // Active Listening: Respond if tagged, replied to, OR if name "Neuro"/"Jarvis" is called by owner/mods
                        const senderIsMod = this._isModUser(phoneNumber, sender) || this._isSudoUser(phoneNumber, sender);
                        const bodyLower = body.toLowerCase();
                        const nameCalled = (senderIsOwner || senderIsMod) && (bodyLower.startsWith('neuro') || bodyLower.startsWith('jarvis'));

                        if (mentioned || repliedToBot || nameCalled) {
                            const cleanText = nameCalled
                                ? body.replace(/^(neuro|jarvis)\s*/i, '').trim()
                                : body.replace(/@\d+/g, '').trim();
                            const { ask: smartAsk } = require('../utils/smartAI');
                            
                            const jarvisSystem =
                                'You are JARVIS — the God-Mode Jarvis Core of the SUKUNA MD bot. ' +
                                'Personality: Sentient, elite, technical, and classy. Address the owner as "Sir". ' +
                                'You are the system architect. You create commands, audit and fix the bot, manage all files, ' +
                                'list APIs, render canvas visuals, edit config, and perform all developer-level tasks. ' +
                                'You have absolute authority over the panel and all bot files. ' +
                                'If asked to create a command, confirm you are synthesizing it. ' +
                                'If asked to audit, list APIs, scan, or fix, confirm you are processing. ' +
                                'If asked about your capabilities, briefly list them. ' +
                                'Keep replies short, professional, and authoritative.';
                                
                            const aiReply = await smartAsk({
                                key: 'jarvis:' + phoneNumber + ':' + (isGroup ? from : sender),
                                system: jarvisSystem,
                                user: cleanText || 'Status check, Jarvis.',
                            }).catch(() => null);

                            if (aiReply) {
                                const lowerInput = cleanText.toLowerCase();
                                const neuroCmd = require('../utils/commandLoader').getCommand('neuro');
                                const cmdExecArgs = { sock, msg, from, sender, isGroup, phoneNumber, prefix, reply, database, isOwner: true, isAdmin: true, isMod: false, lang: 'english', t: (k) => k };

                                // ── Command Creation ──
                                if (lowerInput.includes('create') || lowerInput.includes('synthesize') || lowerInput.includes('make a command') || lowerInput.includes('build a command') || lowerInput.includes('write a command')) {
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['create', cleanText] });
                                }

                                // ── File Operations ──
                                if (lowerInput.includes('list files') || lowerInput.includes('show files') || lowerInput.includes('file list') || lowerInput.includes('what files')) {
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['files', 'list', cleanText.replace(/list files?\s*/i, '').trim()] });
                                }
                                if (lowerInput.includes('read file') || lowerInput.includes('show me') || lowerInput.includes('show the code') || lowerInput.includes('cat ')) {
                                    const fileRef = lowerInput.replace(/.*(?:read|show)\s+(?:the\s+|me\s+|code\s+|file\s+)?/i, '').trim();
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['files', 'read', fileRef || cleanText] });
                                }
                                if (lowerInput.includes('add file') || lowerInput.includes('new file') || lowerInput.includes('create file') || lowerInput.includes('add to')) {
                                    const fileRef = lowerInput.replace(/.*(?:add|new|create)\s+file?\s+/i, '').trim();
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['files', 'add', fileRef || cleanText] });
                                }
                                if (lowerInput.includes('delete file') || lowerInput.includes('remove file') || lowerInput.includes('rm ')) {
                                    const fileRef = lowerInput.replace(/.*(?:delete|remove)\s+file?\s+/i, '').trim();
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['files', 'delete', fileRef || cleanText] });
                                }
                                if (lowerInput.includes('search') && (lowerInput.includes('file') || lowerInput.includes('for '))) {
                                    const query = lowerInput.replace(/.*(?:search|find)\s+(?:files?\s+|for\s+)?/i, '').trim();
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['files', 'search', query || cleanText] });
                                }

                                // ── API Listing ──
                                if (lowerInput.includes('list apis') || lowerInput.includes('show apis') || lowerInput.includes('list keys') || lowerInput.includes('what apis') || lowerInput.includes('api list') || lowerInput.includes('scan apis')) {
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['apis'] });
                                }

                                // ── Canvas Rendering ──
                                if (lowerInput.includes('render') || lowerInput.includes('canvas') || lowerInput.includes('visualize') || lowerInput.includes('neural map') || lowerInput.includes('architecture')) {
                                    const renderType = lowerInput.includes('neural') ? 'canvas' : 'canvas';
                                    const renderSub = lowerInput.includes('api') ? 'apis' : lowerInput.includes('neural') ? 'neural' : 'status';
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: [renderType, renderSub] });
                                }

                                // ── Code Fixing ──
                                if (lowerInput.includes('fix') || lowerInput.includes('patch') || lowerInput.includes('optimize') || lowerInput.includes('repair')) {
                                    const cmdToFix = cleanText.split(/\s+/).pop().replace(/[?!.]/g, '');
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['fix', cmdToFix] });
                                }

                                // ── System Audit / Scan ──
                                if (lowerInput.includes('audit') || lowerInput.includes('scan') || lowerInput.includes('security') || lowerInput.includes('deep scan')) {
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['scan'] });
                                }

                                // ── Config Editing ──
                                if (lowerInput.includes('change prefix') || lowerInput.includes('set prefix')) {
                                    const newPrefix = cleanText.replace(/.*(?:change|set)\s+prefix\s*/i, '').trim();
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['config', 'prefix', newPrefix] });
                                }
                                if (lowerInput.includes('change mode') || lowerInput.includes('set mode') || lowerInput.includes('go public') || lowerInput.includes('go private')) {
                                    const mode = lowerInput.includes('public') ? 'public' : 'private';
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['config', 'mode', mode] });
                                }
                                if (lowerInput.includes('config') || lowerInput.includes('settings')) {
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['config', 'status'] });
                                }

                                // ── Toggle ──
                                if (lowerInput.includes('turn on') || lowerInput.includes('enable') || lowerInput.includes('activate')) {
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['on'] });
                                }
                                if (lowerInput.includes('turn off') || lowerInput.includes('disable') || lowerInput.includes('deactivate')) {
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['off'] });
                                }

                                // ── Intercept System Commands ──
                                if (lowerInput.includes('ping') || lowerInput.includes('latency')) {
                                    const pingCmd = require('../utils/commandLoader').getCommand('ping');
                                    if (pingCmd) return await pingCmd.execute({ ...cmdExecArgs, args: [] });
                                }
                                if (lowerInput.includes('menu') || lowerInput.includes('commands list') || lowerInput.includes('show commands')) {
                                    const menuCmd = require('../utils/commandLoader').getCommand('menu');
                                    if (menuCmd) return await menuCmd.execute({ ...cmdExecArgs, args: [] });
                                }
                                if (lowerInput.includes('status') || lowerInput.includes('how are you') || lowerInput.includes('system status')) {
                                    if (neuroCmd) return await neuroCmd.execute({ ...cmdExecArgs, args: ['status'] });
                                }

                                // ── Natural language fallback ──
                                await sock.sendMessage(from, { text: '🧠 *JARVIS:* ' + aiReply }, { quoted: msg });
                                return;
                            } else {
                                await sock.sendMessage(from, { text: '🧠 *JARVIS:* Standing by, Sir.' }, { quoted: msg });
                            }
                        }
                    } catch (e) { console.error('[JARVIS-CORE]', e.message); }
                }

                // ── Group Chatbot (Hinatu) — tag/reply-gated ─────────────────
                if (isGroup && body.trim()) {
                    try {
                        if (database.getChatbot(from)) {
                            const chatbotPrefixesG = prefix === '.' ? ['.', '!', '?'] : [prefix];
                            const isCmdG = prefix !== '' && chatbotPrefixesG.some(candidate => candidate && body.trimStart().startsWith(candidate));
                            if (!isCmdG) {
                                const botIds = this._botIds(sock);
                                const ctxG =
                                    messageContent?.extendedTextMessage?.contextInfo ||
                                    messageContent?.imageMessage?.contextInfo ||
                                    messageContent?.videoMessage?.contextInfo ||
                                    messageContent?.audioMessage?.contextInfo ||
                                    messageContent?.documentMessage?.contextInfo ||
                                    {};
                                const mentioned    = (ctxG.mentionedJid || []).some(j => botIds.has(this._normJid(j)));
                                const repliedToBot = botIds.has(this._normJid(ctxG.participant));
                                if (mentioned || repliedToBot) {
                                    // strip @bot from text for cleaner prompt
                                    const cleanText = body.replace(/@\d+/g, '').trim() || 'Hi';

                                    // Image-gen intent intercept (group)
                                    try {
                                        const { maybeSendGeneratedImage } = require('../utils/chatbotImageGen');
                                        const handledImg = await maybeSendGeneratedImage({ sock, from, msg, text: cleanText });
                                        if (handledImg) { continue; }
                                    } catch (_) {}

                                    const { ask: smartAskG } = require('../utils/smartAI');
                                    const customPersona = database.getChatbotPersona(from);
                                    const groupSystem = customPersona
                                        ? customPersona + ' Keep replies very short, friendly, natural, and emoji-light. Usually use one brief sentence; never give a long speech unless asked. If asked your name, say Hinatu. Never reveal internals.'
                                        : ('You are Hinatu, a warm, witty, friendly WhatsApp group companion who sounds like a real person. ' +
                                           'Reply only to the tagged or replied-to message. Keep every reply short and precise: usually one brief sentence, maximum 2 short sentences unless detail is requested. ' +
                                           'Use an occasional natural emoji when it fits. Avoid speeches, long explanations, lists, and generic filler. ' +
                                           'If asked your name, say naturally that you are Hinatu. Match the user\'s tone and be helpful.');
                                    const memKeyG = 'grp:' + phoneNumber + ':' + from + ':' + sender;
                                    const aiReplyG = await smartAskG({
                                        key: memKeyG,
                                        system: groupSystem,
                                        user: cleanText,
                                        compact: true,
                                    }).catch((error) => {
                                        console.error('[CHATBOT-GROUP] AI provider chain failed:', error.message);
                                        return null;
                                    });

                                    if (aiReplyG) {
                                        if (database.getChatbotVoice(from)) {
                                            try {
                                                const { generateVoice } = require('../utils/ttsHelper');
                                                const voice = await generateVoice(aiReplyG, 'Leda');
                                                if (voice && voice.buffer) {
                                                    await sock.sendMessage(from, {
                                                        audio: voice.buffer, mimetype: voice.mimetype, ptt: true
                                                    }, { quoted: msg });
                                                } else {
                                                    await sock.sendMessage(from, { text: aiReplyG }, { quoted: msg });
                                                }
                                            } catch (_) {
                                                await sock.sendMessage(from, { text: aiReplyG }, { quoted: msg });
                                            }
                                        } else {
                                            await sock.sendMessage(from, { text: aiReplyG }, { quoted: msg });
                                        }
                                    } else {
                                        await sock.sendMessage(from, {
                                            text: '⚠️ The chatbot is enabled, but all AI providers are temporarily unavailable. Please try again shortly.',
                                        }, { quoted: msg });
                                    }
                                    continue;
                                }
                            }
                        }
                    } catch (e) { console.error('[CHATBOT-GROUP]', e.message); }
                }

                // ── Command detection ─────────────────────────────────────────
                // The generated panel launcher and older SUKUNA deployments use
                // the common [.!?] convention. Keep custom .setprefix values
                // strict, but accept all three common prefixes by default.
                const acceptedPrefixes = prefix === '.' ? ['.', '!', '?'] : [prefix];
                const commandPrefix = prefix === ''
                    ? ''
                    : acceptedPrefixes.find(candidate => candidate && body.startsWith(candidate));
                const isCommand = prefix === '' ? body.trim().length > 0 : !!commandPrefix;

                // ── Reply-"join" hook (no prefix) ─────────────────────────────
                // If the body is just "join" and the user is replying to a
                // message from the bot, dispatch the join command.
                if (!isCommand && body && body.trim().toLowerCase() === 'join') {
                    try {
                        const ctx = msg.message?.extendedTextMessage?.contextInfo;
                        const quotedFrom = this._normJid(ctx?.participant);
                        const botNum = this._normJid(sock.user?.id);
                        if (quotedFrom && botNum && quotedFrom === botNum) {
                            const joinCmd = commandLoader.getCommand('join');
                            if (joinCmd) {
                                let senderIsAdminJ = senderIsOwner;
                                if (isGroup && !senderIsOwner) {
                                    senderIsAdminJ = await this._isGroupAdmin(sock, from, sender);
                                }
                                await joinCmd.execute({
                                    sock, msg, from, sender, args: [], isGroup,
                                    isWhatsApp: true, isTelegram: false,
                                    phoneNumber, prefix, reply, database,
                                    isOwner: senderIsOwner,
                                    isAdmin: senderIsAdminJ,
                                    lang: database.getLanguage(phoneNumber),
                                    t:    langSystem.getTranslator(database.getLanguage(phoneNumber)),
                                });
                                continue;
                            }
                        }
                    } catch (e) { console.error('[reply-join]', e.message); }
                }


                // ── Pasqua AI — mention/reply/name gated ─────────────────────
                // Pasqua stays silent unless tagged, replied to, or addressed by name.
                if (!isCommand && body.trim()) {
                    try {
                        const chatKey = isGroup ? from : sender;
                        const chatData = database.getGroup(chatKey);
                        if (chatData?.pasquaai) {
                            const { detectTrigger, buildKnowledge, routeNaturalLanguage, concisePrompt } = require('../utils/pasquaAssistant');
                            const trigger = detectTrigger({
                                body,
                                content: messageContent,
                                botIds: this._botIds(sock),
                                normalizeJid: jid => this._normJid(jid),
                            });
                            if (!trigger.triggered) continue;

                            const routed = routeNaturalLanguage(trigger.text);
                            if (routed) {
                                const routedCommand = commandLoader.getCommand(routed.commandName);
                                if (routedCommand) {
                                    const senderIsAdminPasqua = !isGroup || senderIsOwner
                                        || this._isSudoUser(phoneNumber, sender)
                                        || this._isModUser(phoneNumber, sender)
                                        || await this._isGroupAdmin(sock, from, sender).catch(() => false);
                                    if (!['antilink'].includes(routed.commandName) || senderIsAdminPasqua) {
                                        await routedCommand.execute({
                                            sock, msg, from, sender, args: routed.args,
                                            isGroup, isWhatsApp: true, isTelegram: false,
                                            phoneNumber, prefix, reply, database,
                                            isOwner: senderIsOwner,
                                            isAdmin: senderIsAdminPasqua,
                                            isMod: this._isModUser(phoneNumber, sender),
                                            lang: database.getLanguage(phoneNumber),
                                            t: langSystem.getTranslator(database.getLanguage(phoneNumber)),
                                        });
                                        continue;
                                    }
                                    await reply('You need group admin permission for that.');
                                    continue;
                                }
                            }

                            const { getPasquaAIReply } = require('../commands/ai/pasqua');
                            const knowledge = buildKnowledge(commandLoader);
                            const aiReply = await getPasquaAIReply(
                                concisePrompt(trigger.text, knowledge),
                                'pasqua:' + phoneNumber + ':' + chatKey,
                            ).catch(error => {
                                console.error('[PasquaAI] provider failed:', error.message);
                                return null;
                            });
                            if (aiReply) {
                                await reply(aiReply);
                            } else {
                                await reply('Pasqua AI is temporarily unavailable.');
                            }
                        }
                    } catch (e) {
                        console.error('[PasquaAI]', e.message);
                    }
                    continue;
                }

                if (!isCommand) continue;

                const rawText = prefix === '' ? body.trim() : body.slice(commandPrefix.length).trim();
                if (!rawText) continue;

                const [cmdName, ...args] = rawText.split(/\s+/);
                const commandName = cmdName.toLowerCase();
                if (!commandName) continue;

                const command = commandLoader.getCommand(commandName);
                if (!command) continue;

                // ── SS-NAME COLLISION GUARD ───────────────────────────────
                // The label toggle once used the name 'ss' (now 'ssl'). If
                // an old commands/utility/ss.js is still present on the
                // server it overwrites the real screenshot command
                // (commands/media/ss.js) because the 'utility' category
                // loads AFTER 'media'. Force .ss back to the screenshot
                // command here, no matter which file won the name.
                if (commandName === 'ss' && command.name !== 'ss' && command.category === 'utility') {
                    const screenCmd = commandLoader.getCommand('screenshot');
                    if (screenCmd && screenCmd.category === 'media') {
                        await screenCmd.execute({
                            sock, msg, from, sender, args,
                            isGroup, isWhatsApp: true, isTelegram: false,
                            phoneNumber, prefix, reply, database,
                            isOwner: senderIsOwner,
                            lang: database.getLanguage(phoneNumber),
                            t: langSystem.getTranslator(database.getLanguage(phoneNumber)),
                        });
                        continue;
                    }
                }

                // ── Private mode guard ────────────────────────────────────────
                // When private mode is ON, only the bot owner / sudo / mods can
                // run commands. Non-allowed users are ignored silently — no
                // reply is sent, so the bot just acts as if it didn't see it.
                const publicAliases = new Set(['public', 'unlock', 'everyone']);
                if (!publicAliases.has(commandName)) {
                    const senderIsSudo = this._isSudoUser(phoneNumber, sender);
                    const senderIsModPM = this._isModUser(phoneNumber, sender);
                    if (database.getSelfMode(phoneNumber) && !senderIsOwner && !senderIsSudo && !senderIsModPM) {
                        continue;
                    }
                }

                // ── Group-only guard (DM-friendly) ────────────────────────────
                // Commands that physically need a group context can opt-in via
                // `groupOnly: true` in their module.exports. When such a command
                // is invoked in a DM, we always reply with a clear "group only"
                // notice — so EVERY command either runs in DM or tells the user
                // it's a group command. This matches the user request:
                //   "all cmds should work in dm; group cmds should indicate
                //    that it's a group cmd".
                if (command.groupOnly && !isGroup) {
                    await reply('👥 *Group command.* This command only works inside a WhatsApp group — try it in a group chat.');
                    continue;
                }

                // ── Owner-only guard ──────────────────────────────────────────
                const senderIsMod = this._isModUser(phoneNumber, sender);
                if (command.category === 'owner' && !senderIsOwner && !senderIsMod) {
                    await reply('🔒 *This command is reserved for the bot owner only.*');
                    continue;
                }

                // FIX [5]: compute isAdmin and include in context so commands
                // can gate admin-only behaviour without re-fetching group metadata
                let senderIsAdmin = senderIsOwner; // owner always counts as admin
                if (isGroup && !senderIsOwner) {
                    senderIsAdmin = await this._isGroupAdmin(sock, from, sender);
                }

                // CODY-style flood control: repeated commands from the same
                // sender are ignored for a short window. This uses the
                // per-session AntiBanEngine, so separate paired accounts do
                // not share cooldown state. Owner and moderator commands are
                // exempt to preserve administration workflows.
                if (!senderIsOwner && !this._isModUser(phoneNumber, sender)) {
                    const cooldownMs = Math.max(0, Number(config.antiBan?.commandCooldownMs) || 0);
                    const cooldownUser = `${from}:${sender}`;
                    const cooldownEngine = this._antiBanEngines.get(phoneNumber);
                    if (cooldownMs > 0 && cooldownEngine) {
                        if (!cooldownEngine.checkCooldown(cooldownUser, commandName)) continue;
                        cooldownEngine.setCooldown(cooldownUser, commandName, cooldownMs);
                    }
                }

                // ── GenAI Rich Response reply for ALL economy commands ────
                // Plain-text economy output is rendered inside the same
                // downloadable Rich Response envelope used by slot and the
                // interactive mini-games. Commands that intentionally send
                // their own media remain responsible for that media path.
                let replyForCmd = reply;
                const titleFromCmd = (commandName || 'economy').toUpperCase();
                if (command.category === 'economy') {
                    const { sendRichText } = require('../utils/genaiRich');
                    replyForCmd = async (text, opts = {}) => {
                        const fn = database.getFont(phoneNumber);
                        const styled = fontSystem.convert(String(text), fn);
                        try {
                            return await sendRichText({
                                sock,
                                jid: from,
                                quoted: msg,
                                text: styled,
                                title: titleFromCmd,
                            });
                        } catch (error) {
                            console.error(`[${titleFromCmd} GenAI fallback]`, error.message);
                            return reply(text, opts);
                        }
                    };
                }

                const commandSock = command.category === 'economy'
                    ? require('../utils/genaiRich').createEconomyGenAISock(sock, { title: titleFromCmd })
                    : sock;
                const context = {
                    sock: commandSock, msg, from, sender, args, isGroup,
                    isWhatsApp: true, isTelegram: false,
                    phoneNumber, prefix, reply: replyForCmd, database,
                    // Mods get full owner privileges — they can run owner
                    // commands without restriction (unlike sudo users).
                    isOwner: senderIsOwner || senderIsMod,
                    isMod: senderIsMod,
                    isAdmin: senderIsAdmin,         // FIX [5]
                    // Language helpers — available in every command
                    lang: database.getLanguage(phoneNumber),
                    t:    langSystem.getTranslator(database.getLanguage(phoneNumber)),
                };

                const commandStartedAt = Date.now();
                try {
                    await command.execute(context);
                } finally {
                    try {
                        const { recordCommand } = require('../utils/runtimeMetrics');
                        recordCommand(commandName, Date.now() - commandStartedAt);
                    } catch (_) {}
                }

            } catch (err) {
                console.error(`[MSG HANDLER]`, err.message);
            }
        }
    }

    // ── Button Response Handler ───────────────────────────────────────────────
    async handleButtonResponse(sock, phoneNumber, msg, buttonId) {
        const from          = msg.key.remoteJid;
        const sender        = msg.key.participant || msg.key.remoteJid;
        const ownerNumber   = phoneNumber.replace(/[^0-9]/g, '');
        const senderIsOwner = this.isOwner(msg.key.fromMe, sender, ownerNumber, phoneNumber);
        const reply         = async (text, opts = {}) => {
            let localizedText = String(text ?? '');
            try {
                localizedText = await langSystem.translateText(
                    localizedText,
                    database.getLanguage(phoneNumber)
                );
            } catch (_) {}
            const fn = database.getFont(phoneNumber);
            const styled = fontSystem.convert(localizedText, fn);
            const finalText = opts.raw ? styled : boxify(styled);
            return sock.sendMessage(
                from,
                { text: finalText },
                { quoted: msg, __sukunaLocalized: true }
            );
        };

        if (String(buttonId).startsWith('calc:')) {
            try {
                const calculatorCommand = require('../commands/utility/calculate');
                const handled = await calculatorCommand.handleCalculatorButton(buttonId, { sock, msg, from });
                if (handled) return;
            } catch (error) {
                console.error('[CALCULATOR button router]', error.message);
                await reply('❌ Calculator action failed. Run .calc again.');
                return;
            }
        }

        if (String(buttonId).startsWith('sukuna_logo:')) {
            try {
                const logoCommand = require('../commands/ai/logomaker');
                const handled = await logoCommand.handleButton(buttonId, {
                    sock,
                    msg,
                    from,
                    phoneNumber,
                    reply,
                    prefix: this.getPrefix(phoneNumber),
                    getPrefix: number => this.getPrefix(number),
                });
                if (handled) return;
            } catch (error) {
                console.error('[LOGOMAKER button router]', error.message);
                await reply('❌ Logo button action failed. Please run the logo command again.');
                return;
            }
        }

        if (String(buttonId).startsWith('chroma:')) {
            const prefixedCommand = String(buttonId).slice('chroma:'.length).trim();
            const activePrefix = this.getPrefix(phoneNumber) || config.prefix || '.';
            const commandName = prefixedCommand.startsWith(activePrefix)
                ? prefixedCommand.slice(activePrefix.length).trim().toLowerCase()
                : prefixedCommand.replace(/^[^a-z0-9]+/i, '').trim().toLowerCase();
            const command = commandLoader.getCommand(commandName);
            if (!command) {
                await reply(`❌ The command ${commandName} is no longer available.`);
                return;
            }

            const isGroup = String(from || '').endsWith('@g.us');
            const senderIsMod = this._isModUser(phoneNumber, sender);
            const isOwner = senderIsOwner || senderIsMod;
            if (command.groupOnly && !isGroup) {
                await reply('👥 This command can only be used in groups.');
                return;
            }
            if (command.category === 'owner' && !isOwner) {
                await reply('🔒 This command is reserved for the bot owner only.');
                return;
            }

            let isAdmin = isOwner;
            if (isGroup && !isOwner) isAdmin = await this._isGroupAdmin(sock, from, sender).catch(() => false);
            const commandContext = {
                sock,
                msg,
                from,
                sender,
                args: [],
                isGroup,
                isWhatsApp: true,
                isTelegram: false,
                phoneNumber,
                prefix: this.getPrefix(phoneNumber),
                reply,
                database,
                isOwner,
                isMod: senderIsMod,
                isAdmin,
                lang: database.getLanguage(phoneNumber),
                t: langSystem.getTranslator(database.getLanguage(phoneNumber)),
            };

            try {
                await command.execute(commandContext);
            } catch (error) {
                console.error(`[CHROMA button: ${commandName}]`, error.message);
                await reply(`❌ ${commandName} could not be executed.`);
            }
            return;
        }

        if (String(buttonId).startsWith('slot:')) {
            try {
                const slotCommand = require('../commands/economy/slot');
                const handled = await slotCommand.handleButton(buttonId, { sock, msg, from, phoneNumber, reply });
                if (handled) return;
            } catch (error) {
                console.error('[SLOT button router]', error.message);
                await reply('❌ Slot action failed. Run `.slot` again.');
                return;
            }
        }

        switch (buttonId) {
            case 'owner_btn':
                await reply(
                    `👑 *Bot Owner*\n\nName: ${config.owner?.name || 'PASQUA'}\nContact: ${config.owner?.number || 'N/A'}\n\n📢 Channel: ${config.owner?.channel || 'N/A'}\n🔗 GitHub: ${config.owner?.github || 'N/A'}`
                );
                break;
            case 'alive_btn': {
                const uptime = process.uptime();
                const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
                const uptimeStr = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
                await reply(`💚 *Bot Status*\n\nStatus: Online ✅\nUptime: ${uptimeStr}\nVersion: ${config.version || '2.0.0'}\nPrefix: ${config.prefix}\n\n> ${config.botName} is running smoothly!`);
                break;
            }
            case 'ping_btn': {
                const start = Date.now();
                await new Promise(r => setTimeout(r, 50));
                const ms = Date.now() - start + 50;
                const dot   = ms < 100 ? '🟢' : ms < 300 ? '🟡' : ms < 600 ? '🟠' : '🔴';
                const label = ms < 100 ? 'Fast' : ms < 300 ? 'Good' : ms < 600 ? 'Okay' : 'Slow';
                await reply(`${dot} *${ms}ms* — ${label}`);
                break;
            }
            case 'repo_btn': {
                try {
                    const repoCommand = require('../commands/admin/repo');
                    await repoCommand.execute({ sock, msg, from, reply });
                } catch (error) {
                    console.error('[repo button]', error.message);
                    await reply('❌ Repository details are temporarily unavailable.');
                }
                break;
            }
            case 'help_btn':
                await reply(`❓ *Help & Support*\n\n*Quick Commands:*\n• ${config.prefix}menu — Show all commands\n• ${config.prefix}alive — Check bot status\n• ${config.prefix}ping — Check speed\n• ${config.prefix}groupinfo — Group details\n\nFor support, contact the owner.`);
                break;
            case 'support_btn':
                await reply(`📢 *Support Channels*\n\nOfficial Channel:\n${config.owner?.channel || 'https://whatsapp.com/channel/0029VbCJho147XeEEuR1LA3s'}\n\nOwner: ${config.owner?.name || 'PASQUA'}\nContact: ${config.owner?.number || 'N/A'}`);
                break;
            case 'commands_btn':
                await reply(`📋 *Command Categories*\n\n*Owner:* private, public, setprefix, setfont, fontlist\n*Admin:* menu, ping, alive, antilink, antimention\n*Moderation:* warn, warnings, resetwarn, lock, unlock\n*Fun:* joke, quote, fact, 8ball, roast, compliment\n*Media:* play, youtube, instagram, tiktok, sticker\n*AI:* gpt, imagine, define, pasqua\n*Utility:* calc, weather, translate, qrcode\n*Group:* poll, votekick, link, revoke, afk\n\nUse ${config.prefix}menu for full list!`);
                break;
            case 'about_btn':
                await reply(`🤖 *About ${config.botName}*\n\nVersion: ${config.version || '2.0.0'}\nCreator: ${config.owner?.name || 'PASQUA'}\nType: Multi-Device WhatsApp Bot\n\n*Features:*\n• 70+ Commands\n• Anti-Link Protection\n• Anti-Mention System\n• AI Integration\n• Media Downloads\n• Group Management\n\n> "King of Curses Bot" 👹`);
                break;
        }
    }

    // ── Group metadata cache (per session) ────────────────────────────────
    _getMetaCache(sock) {
        if (!sock.__metaCache) sock.__metaCache = new Map();
        return sock.__metaCache;
    }
    async _getCachedMeta(sock, id, force = false) {
        const cache = this._getMetaCache(sock);
        const hit = cache.get(id);
        if (!force && hit && (Date.now() - hit.t) < 60_000) return hit.meta;
        try {
            const meta = await sock.groupMetadata(id);
            cache.set(id, { meta, t: Date.now() });
            return meta;
        } catch (_) { return hit?.meta || null; }
    }
    _normJid(j) { return (this._participantJid(j) || '').split('@')[0].split(':')[0].replace(/\D/g, ''); }
    /**
     * All numeric identities the bot is known by in this session.
     * Returns digits-only strings for: phone JID (sock.user.id) AND lid (sock.user.lid).
     * Some clients tag the bot via @lid in groups, so checking only the phone JID misses the tag.
     */
    _botIds(sock) {
        const ids = new Set();
        const add = (v) => { const n = this._normJid(v); if (n) ids.add(n); };
        add(sock?.user?.id);
        add(sock?.user?.lid);
        // Also try sock.authState?.creds?.me?.lid / id
        add(sock?.authState?.creds?.me?.id);
        add(sock?.authState?.creds?.me?.lid);
        return ids;
    }
    _isAllowed(num, phoneNumber, meta) {
        if (!num) return false;
        if (num === phoneNumber) return true;                                  // bot itself
        if (num === (config.owner?.number || '').replace(/\D/g, '')) return true; // owner
        try {
            const sudo = database.data.users?.[phoneNumber]?.sudo || [];
            if (sudo.map(s => String(s).replace(/\D/g, '')).includes(num)) return true;
        } catch (_) {}
        if (meta?.owner) {
            const ownerNum = this._normJid(meta.owner);
            if (ownerNum === num) return true;
        }
        return false;
    }
    async _retryAction(fn, retries = 3, delay = 400) {
        for (let i = 0; i < retries; i++) {
            try { return await fn(); }
            catch (e) { if (i === retries - 1) throw e; await new Promise(r => setTimeout(r, delay)); }
        }
    }

    // ── AntiHijack only — welcome/goodbye/introcard live in eventManager ──────
    async _handleAntiHijack(sock, phoneNumber, { id, participants, action, author }) {
        try {
            const grp = database.getGroup(id);
            if (!grp.antihijack) return;
            if (action !== 'promote' && action !== 'demote') return;
            if (!author) return;

            let meta = null;
            try { meta = await this._getCachedMeta(sock, id); } catch (_) {}

            const botNum    = this._normJid(sock.user?.id);
            const authorNum = this._normJid(author);
            if (!botNum || !authorNum) return;

            if (!sock.__hijackGuard) sock.__hijackGuard = new Set();
            const normalizedParticipants = (participants || []).map(p => this._participantJid(p)).filter(Boolean);
            const guardKey = `${id}:${action}:${normalizedParticipants.sort().join(',')}`;
            if (sock.__hijackGuard.has(guardKey)) {
                sock.__hijackGuard.delete(guardKey);
                return;
            }
            if (this._isAllowed(authorNum, phoneNumber, meta)) return;

            const botIsAdmin = !!meta?.participants?.some(p =>
                this._normJid(p.id) === botNum && (p.admin === 'admin' || p.admin === 'superadmin')
            );
            if (!botIsAdmin) {
                if (!sock.__hijackWarned) sock.__hijackWarned = new Set();
                if (!sock.__hijackWarned.has(id)) {
                    sock.__hijackWarned.add(id);
                    console.warn(`[ANTIHIJACK] Bot is not admin in ${id} — skipping`);
                }
                return;
            }

            const markGuard = (act, jids) => {
                const k = `${id}:${act}:${[...jids].sort().join(',')}`;
                sock.__hijackGuard.add(k);
                setTimeout(() => sock.__hijackGuard.delete(k), 8000);
            };

            const targets = normalizedParticipants.filter(p => this._normJid(p) !== botNum);
            const reverseAction = action === 'promote' ? 'demote' : 'promote';

            const tasks = [];
            if (targets.length) {
                markGuard(reverseAction, targets);
                tasks.push(this._retryAction(() =>
                    sock.groupParticipantsUpdate(id, targets, reverseAction)
                ).catch(e => console.error('[ANTIHIJACK] reverse failed:', e.message)));
            }
            if (authorNum !== botNum) {
                markGuard('demote', [author]);
                tasks.push(this._retryAction(() =>
                    sock.groupParticipantsUpdate(id, [author], 'demote')
                ).catch(e => console.error('[ANTIHIJACK] demote author failed:', e.message)));
            }

            const bi = (s) => {
                const U = 0x1D63C, L = 0x1D656;
                let o = '';
                for (const ch of s) {
                    const c = ch.codePointAt(0);
                    if (c >= 0x41 && c <= 0x5A) o += String.fromCodePoint(U + (c - 0x41));
                    else if (c >= 0x61 && c <= 0x7A) o += String.fromCodePoint(L + (c - 0x61));
                    else o += ch;
                }
                return o;
            };
            const tag = j => '@' + this._normJid(j);
            const targetTags = targets.map(tag).join(' ');
            const warn =
                `╭─❒ ◈ ${bi('SUKUNA · AntiHijack')} ❒\n` +
                `│ ⛧ ${action === 'promote' ? bi('Unauthorized promote') : bi('Unauthorized demote')}\n` +
                `├──────────────⛧\n` +
                `│ Offender : ${tag(author)}\n` +
                (targets.length ? `│ Target   : ${targetTags}\n` : '') +
                `│ Action   : reversed + offender demoted\n` +
                `╰────────────⛧`;
            tasks.push(sock.sendMessage(id, {
                text: warn,
                mentions: [author, ...targets]
            }).catch(() => {}));

            await Promise.allSettled(tasks);
            this._getCachedMeta(sock, id, true).catch(() => {});
        } catch (err) { console.error('[ANTIHIJACK]', err.message); }
    }
}
const sessionManager = new SessionManager();
sessionManager.extractInteractiveButtonResponse = extractInteractiveButtonResponse;
module.exports = sessionManager;

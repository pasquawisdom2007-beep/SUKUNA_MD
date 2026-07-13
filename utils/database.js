/**
 * Database Handler - Per-session JSON storage
 */

const fs = require('fs');
const path = require('path');

class Database {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.ensureDataDir();

        this.data = {
            groups: this.load('groups') || {},
            users: this.load('users') || {},
            warnings: this.load('warnings') || {},
            banned: this.load('banned') || {},
            lastSeen: this.load('lastSeen') || {},
            msgCounts: this.load('msgCounts') || {},
            ownerInfo: this.load('ownerInfo') || {}
        };
        this._lastSeenSaveAt = 0;
        this._msgCountSaveAt = 0;
    }

    // ── Owner Info Overrides (used by .owner / .setname / .setbio) ─────
    getOwnerInfo() {
        return this.data.ownerInfo || {};
    }

    setOwnerInfo(key, value) {
        if (!this.data.ownerInfo) this.data.ownerInfo = {};
        this.data.ownerInfo[key] = value;
        this.save('ownerInfo');
    }




    // ── Activity tracking (for .kick inactive) ─────────────────────────
    markSeen(groupId, userJid) {
        if (!groupId || !userJid) return;
        if (!this.data.lastSeen[groupId]) this.data.lastSeen[groupId] = {};
        this.data.lastSeen[groupId][userJid] = Date.now();
        // Throttle disk writes to once every 30s — activity logging is hot.
        const now = Date.now();
        if (now - this._lastSeenSaveAt > 30000) {
            this._lastSeenSaveAt = now;
            try { this.save('lastSeen'); } catch (_) {}
        }
    }

    getLastSeen(groupId, userJid) {
        return this.data.lastSeen?.[groupId]?.[userJid] || 0;
    }

    // ── Per-member message counters (for .listactive / .listinactive) ──
    incMessageCount(groupId, userJid) {
        if (!groupId || !userJid) return;
        if (!this.data.msgCounts[groupId]) this.data.msgCounts[groupId] = {};
        this.data.msgCounts[groupId][userJid] = (this.data.msgCounts[groupId][userJid] || 0) + 1;
        // Throttle disk writes — this runs on every group message.
        const now = Date.now();
        if (now - this._msgCountSaveAt > 30000) {
            this._msgCountSaveAt = now;
            try { this.save('msgCounts'); } catch (_) {}
        }
    }

    getMessageCount(groupId, userJid) {
        return this.data.msgCounts?.[groupId]?.[userJid] || 0;
    }

    // Returns a plain object { userJid: count } for the whole group.
    getMessageCounts(groupId) {
        return this.data.msgCounts?.[groupId] || {};
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    load(filename) {
        const filePath = path.join(this.dataDir, `${filename}.json`);
        if (fs.existsSync(filePath)) {
            try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
        }
        return null;
    }

    save(filename) {
        const filePath = path.join(this.dataDir, `${filename}.json`);
        fs.writeFileSync(filePath, JSON.stringify(this.data[filename], null, 2));
    }

    // Group methods
    getGroup(groupId) {
        // Full default shape — every feature key must be listed here.
        // New keys added here are automatically merged into existing groups
        // so old saved data never silently misses a field.
        const DEFAULTS = {
            antilink: false,
            antilinkAction: 'delete',
            antimention: false,
            antimentionMode: 'normal',
            antimentionAction: 'warn',
            antimentionMax: 5,
            antimentionWarnings: {},
            welcome: false,
            welcomeMessage: '',
            goodbye: false,
            goodbyeMessage: '',
            introcard: false,
            introcardMessage: '',
            introcardTitle: '',
            introcardTheme: 'default',
            introcardVideo: null,
            mute: false,
            pasquaai: false,
            antiedit: false,
            antidelete: false,
            antihijack: false,
            antibot: false,
            antibotMode: 'kick',
            antisticker: false,
            antiviewonce: false,
        };

        if (!this.data.groups[groupId]) {
            this.data.groups[groupId] = { ...DEFAULTS };
            this.save('groups');
        } else {
            // Merge in any keys that are missing from existing saved groups
            // (handles schema migrations without wiping data).
            let changed = false;
            for (const [k, v] of Object.entries(DEFAULTS)) {
                if (!(k in this.data.groups[groupId])) {
                    this.data.groups[groupId][k] = v;
                    changed = true;
                }
            }
            if (changed) this.save('groups');
        }

        return this.data.groups[groupId];
    }

    setGroup(groupId, key, value) {
        if (!this.data.groups[groupId]) this.data.groups[groupId] = {};
        this.data.groups[groupId][key] = value;
        this.save('groups');
    }

    // Generic helpers used by moderation commands (antiforward, blacklist, etc.)
    getGroupData(groupId, key) {
        return this.getGroup(groupId)[key];
    }

    setGroupData(groupId, key, value) {
        this.setGroup(groupId, key, value);
    }

    // Session mode (private/public per bot number)
    getSelfMode(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].selfMode;
    }

    setSelfMode(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].selfMode = value;
        this.save('users');
    }

    // ── Menu design (per session) ────────────────────────────────────
    getMenuDesign(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return this.data.users[phoneNumber].menuDesign || 'nor';
    }

    setMenuDesign(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].menuDesign = String(value || 'nor').toLowerCase();
        this.save('users');
    }

    // ── Auto-Typing toggle (per session) ─────────────────────────────
    getAutoTyping(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].autoTyping;
    }

    setAutoTyping(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].autoTyping = !!value;
        this.save('users');
    }

    // ── Auto-Recording toggle (per session) ──────────────────────────
    getAutoRecording(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].autoRecording;
    }

    setAutoRecording(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].autoRecording = !!value;
        this.save('users');
    }

    getOwnerNumber(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return this.data.users[phoneNumber].ownerNumber || phoneNumber;
    }

    /**
     * Get the custom prefix for a session.
     * Returns:
     *   null           — no-prefix mode (set via .setprefix null)
     *   string         — a custom prefix
     *   undefined      — not set, caller should fall back to global config.prefix
     */
    getPrefix(phoneNumber) {
        if (!this.data.users[phoneNumber]) return undefined;
        const val = this.data.users[phoneNumber].prefix;
        // We store null explicitly for no-prefix mode
        if (val === null || val === 'null') return null;
        if (typeof val === 'string') return val;
        return undefined;
    }

    /**
     * Set the prefix for a session.
     * Pass null to enable no-prefix mode.
     * Pass a string to set a custom prefix.
     */
    setPrefix(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].prefix = value; // null stored as null
        this.save('users');
    }

    isBanned(userId) {
        return !!this.data.banned[userId];
    }

    setBanned(userId, value) {
        this.data.banned[userId] = value;
        this.save('banned');
    }

    // Warning methods
    addWarning(groupId, userId) {
        if (!this.data.warnings[groupId]) this.data.warnings[groupId] = {};
        if (!this.data.warnings[groupId][userId]) this.data.warnings[groupId][userId] = 0;
        this.data.warnings[groupId][userId]++;
        this.save('warnings');
        return this.data.warnings[groupId][userId];
    }

    getWarnings(groupId, userId) {
        return this.data.warnings[groupId]?.[userId] || 0;
    }

    resetWarnings(groupId, userId) {
        if (this.data.warnings[groupId]) {
            delete this.data.warnings[groupId][userId];
            this.save('warnings');
        }
    }

    // ── Chatbot DM (AI assistant for private DMs) ─────────────────────────
    getChatbotDM(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].chatbotDM;
    }

    setChatbotDM(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].chatbotDM = value;
        this.save('users');
    }

    // ── Chatbot DM voice mode (replies as voice notes) ─────────────────────
    getChatbotDMVoice(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].chatbotDMVoice;
    }

    setChatbotDMVoice(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].chatbotDMVoice = value;
        this.save('users');
    }

    // ── Group Chatbot (AI auto-reply for groups, tag-gated) ───────────────
    _ensureGroup(groupId) {
        if (!this.data.groups) this.data.groups = {};
        if (!this.data.groups[groupId]) this.data.groups[groupId] = {};
        return this.data.groups[groupId];
    }
    getChatbot(groupId)            { return !!this._ensureGroup(groupId).chatbot; }
    setChatbot(groupId, value)     { this._ensureGroup(groupId).chatbot = !!value; this.save('groups'); }
    getChatbotVoice(groupId)       { return !!this._ensureGroup(groupId).chatbotVoice; }
    setChatbotVoice(groupId, value){ this._ensureGroup(groupId).chatbotVoice = !!value; this.save('groups'); }
    getChatbotPersona(groupId)     { return this._ensureGroup(groupId).chatbotPersona || null; }
    setChatbotPersona(groupId, val){
        const g = this._ensureGroup(groupId);
        if (val) g.chatbotPersona = String(val).slice(0, 1000);
        else delete g.chatbotPersona;
        this.save('groups');
    }

    // ── Sudo users (trusted users allowed to use the bot in private mode) ──
    getSudoUsers(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return this.data.users[phoneNumber].sudoUsers || [];
    }

    addSudoUser(phoneNumber, userJid) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        if (!this.data.users[phoneNumber].sudoUsers) this.data.users[phoneNumber].sudoUsers = [];
        const list = this.data.users[phoneNumber].sudoUsers;
        if (!list.includes(userJid)) {
            list.push(userJid);
            this.save('users');
        }
    }

    removeSudoUser(phoneNumber, userJid) {
        if (!this.data.users[phoneNumber]) return;
        if (!this.data.users[phoneNumber].sudoUsers) return;
        this.data.users[phoneNumber].sudoUsers =
            this.data.users[phoneNumber].sudoUsers.filter(j => j !== userJid);
        this.save('users');
    }

    isSudoUser(phoneNumber, userJid) {
        const list = this.getSudoUsers(phoneNumber);
        const base = userJid.split(':')[0] + '@s.whatsapp.net';
        return list.some(j => j === userJid || j === base);
    }


    // ── Mod users (sudo + may also run owner-category commands) ────────────
    getModUsers(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return this.data.users[phoneNumber].modUsers || [];
    }
    addModUser(phoneNumber, userJid) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        if (!this.data.users[phoneNumber].modUsers) this.data.users[phoneNumber].modUsers = [];
        const list = this.data.users[phoneNumber].modUsers;
        if (!list.includes(userJid)) { list.push(userJid); this.save('users'); }
    }
    removeModUser(phoneNumber, userJid) {
        if (!this.data.users[phoneNumber]?.modUsers) return;
        this.data.users[phoneNumber].modUsers =
            this.data.users[phoneNumber].modUsers.filter(j => j !== userJid);
        this.save('users');
    }
    isModUser(phoneNumber, userJid) {
        const list = this.getModUsers(phoneNumber);
        const base = (userJid || '').split(':')[0] + (userJid?.includes('@') ? '' : '@s.whatsapp.net');
        const normBase = userJid?.split(':')[0];
        return list.some(j => j === userJid || j === base || j.split(':')[0] === normBase);
    }

    // ── Auto-view + auto-like status (per-bot toggle) ──────────────────────
    getAutoViewStatus(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].autoViewStatus;
    }
    setAutoViewStatus(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].autoViewStatus = !!value;
        this.save('users');
    }

    // ── Auto-save status to bot owner's DM (per-bot toggle) ────────────────
    getAutoSaveStatus(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].autoSaveStatus;
    }
    setAutoSaveStatus(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].autoSaveStatus = !!value;
        this.save('users');
    }


    // ── Auto-Read: mark every incoming message as read (per-bot toggle) ────
    // Works in both group chats and DMs (private messages).
    getAutoRead(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].autoRead;
    }
    setAutoRead(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].autoRead = !!value;
        this.save('users');
    }

    // ── Ghost Mode: suppress ALL outgoing read+delivery receipts (per-bot)
    // When ON, the bot still receives and processes every message, but the
    // sender only sees a single grey tick ✓ (no delivery, no read).
    getGhostMode(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return !!this.data.users[phoneNumber].ghostMode;
    }
    setGhostMode(phoneNumber, value) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].ghostMode = !!value;
        this.save('users');
    }

    // ── Anti-Mention Warnings ──────────────────────────────────────────────
    addAntiMentionWarning(groupId, userId) {
        const group = this.getGroup(groupId);
        if (!group.antimentionWarnings) group.antimentionWarnings = {};
        if (!group.antimentionWarnings[userId]) group.antimentionWarnings[userId] = 0;
        group.antimentionWarnings[userId]++;
        this.setGroup(groupId, 'antimentionWarnings', group.antimentionWarnings);
        return group.antimentionWarnings[userId];
    }

    getAntiMentionWarnings(groupId, userId) {
        const group = this.getGroup(groupId);
        return group.antimentionWarnings?.[userId] || 0;
    }

    resetAntiMentionWarnings(groupId, userId) {
        const group = this.getGroup(groupId);
        if (group.antimentionWarnings) {
            delete group.antimentionWarnings[userId];
            this.setGroup(groupId, 'antimentionWarnings', group.antimentionWarnings);
        }
    }

    // ── Language System ────────────────────────────────────────────────────
    /**
     * Get the bot language for a session.
     * Defaults to 'english' if not set.
     * @param {string} phoneNumber
     * @returns {string}
     */
    getLanguage(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return this.data.users[phoneNumber].language || 'english';
    }

    /**
     * Set the bot language for a session.
     * @param {string} phoneNumber
     * @param {string} lang  — lowercase language name, e.g. 'french'
     */
    setLanguage(phoneNumber, lang) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].language = lang.toLowerCase().trim();
        this.save('users');
    }

    // ── Font System ────────────────────────────────────────────────────────
    getFont(phoneNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        return this.data.users[phoneNumber].font || 1; // Default to font 1
    }

    setFont(phoneNumber, fontNumber) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        this.data.users[phoneNumber].font = fontNumber;
        this.save('users');
    }

    // ── Muted Users ─────────────────────────────────────────────────────────
    setMutedUser(groupId, userId, expiresAt) {
        const group = this.getGroup(groupId);
        if (!group.mutedUsers) group.mutedUsers = {};
        group.mutedUsers[userId] = expiresAt;
        this.setGroup(groupId, 'mutedUsers', group.mutedUsers);
    }

    removeMutedUser(groupId, userId) {
        const group = this.getGroup(groupId);
        if (group.mutedUsers) {
            delete group.mutedUsers[userId];
            this.setGroup(groupId, 'mutedUsers', group.mutedUsers);
        }
    }

    isUserMuted(groupId, userId) {
        const group = this.getGroup(groupId);
        if (!group.mutedUsers || !group.mutedUsers[userId]) return false;
        
        const expiresAt = group.mutedUsers[userId];
        if (Date.now() > expiresAt) {
            // Auto-expire
            delete group.mutedUsers[userId];
            this.setGroup(groupId, 'mutedUsers', group.mutedUsers);
            return false;
        }
        return true;
    }

    getMutedUsers(groupId) {
        const group = this.getGroup(groupId);
        if (!group.mutedUsers) return {};
        
        // Clean up expired mutes
        const now = Date.now();
        const activeMutes = {};
        for (const [userId, expiresAt] of Object.entries(group.mutedUsers)) {
            if (now <= expiresAt) {
                activeMutes[userId] = expiresAt;
            }
        }
        
        // Update if any expired
        if (Object.keys(activeMutes).length !== Object.keys(group.mutedUsers).length) {
            this.setGroup(groupId, 'mutedUsers', activeMutes);
        }
        
        return activeMutes;
    }

    // ── Blocked Stickers ────────────────────────────────────────────────────
    blockSticker(groupId, stickerHash) {
        const group = this.getGroup(groupId);
        if (!group.blockedStickers) group.blockedStickers = [];
        if (!group.blockedStickers.includes(stickerHash)) {
            group.blockedStickers.push(stickerHash);
            this.setGroup(groupId, 'blockedStickers', group.blockedStickers);
        }
    }

    unblockSticker(groupId, stickerHash) {
        const group = this.getGroup(groupId);
        if (group.blockedStickers) {
            group.blockedStickers = group.blockedStickers.filter(h => h !== stickerHash);
            this.setGroup(groupId, 'blockedStickers', group.blockedStickers);
        }
    }

    isStickerBlocked(groupId, stickerHash) {
        const group = this.getGroup(groupId);
        return group.blockedStickers?.includes(stickerHash) || false;
    }

    getBlockedStickers(groupId) {
        const group = this.getGroup(groupId);
        return group.blockedStickers || [];
    }

    // ── Anti-Link Warnings ──────────────────────────────────────────────────
    addAntiLinkWarning(groupId, userId) {
        const group = this.getGroup(groupId);
        if (!group.antilinkWarnings) group.antilinkWarnings = {};
        if (!group.antilinkWarnings[userId]) {
            group.antilinkWarnings[userId] = { count: 0, lastWarning: 0 };
        }
        
        const now = Date.now();
        const cooldown = (group.antilinkCooldown || 24) * 60 * 60 * 1000; // hours to ms
        
        // Reset if cooldown passed
        if (now - group.antilinkWarnings[userId].lastWarning > cooldown) {
            group.antilinkWarnings[userId].count = 0;
        }
        
        group.antilinkWarnings[userId].count++;
        group.antilinkWarnings[userId].lastWarning = now;
        
        this.setGroup(groupId, 'antilinkWarnings', group.antilinkWarnings);
        return group.antilinkWarnings[userId].count;
    }

    getAntiLinkWarnings(groupId, userId) {
        const group = this.getGroup(groupId);
        if (!group.antilinkWarnings || !group.antilinkWarnings[userId]) return 0;
        
        const now = Date.now();
        const cooldown = (group.antilinkCooldown || 24) * 60 * 60 * 1000;
        
        // Return 0 if cooldown passed
        if (now - group.antilinkWarnings[userId].lastWarning > cooldown) {
            return 0;
        }
        
        return group.antilinkWarnings[userId].count;
    }

    resetAntiLinkWarnings(groupId, userId) {
        const group = this.getGroup(groupId);
        if (group.antilinkWarnings && group.antilinkWarnings[userId]) {
            delete group.antilinkWarnings[userId];
            this.setGroup(groupId, 'antilinkWarnings', group.antilinkWarnings);
        }
    }

    // ── Sticker Custom Commands ─────────────────────────────────────────────
    setStickerCmd(groupId, stickerHash, responseText) {
        const group = this.getGroup(groupId);
        if (!group.stickerCmds) group.stickerCmds = {};
        group.stickerCmds[stickerHash] = responseText;
        this.setGroup(groupId, 'stickerCmds', group.stickerCmds);
    }

    deleteStickerCmd(groupId, stickerHash) {
        const group = this.getGroup(groupId);
        if (group.stickerCmds && group.stickerCmds[stickerHash]) {
            delete group.stickerCmds[stickerHash];
            this.setGroup(groupId, 'stickerCmds', group.stickerCmds);
            return true;
        }
        return false;
    }

    getStickerCmd(groupId, stickerHash) {
        const group = this.getGroup(groupId);
        return group.stickerCmds?.[stickerHash] || null;
    }

    getAllStickerCmds(groupId) {
        const group = this.getGroup(groupId);
        return group.stickerCmds || {};
    }

    // ── Mention React — keyed by the user's own phone number ──────────────
    // phoneNumber = bot session, userPhone = owner or mod's own number
    getMentionReact(phoneNumber, userPhone) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        const key = `mentionReact_${userPhone || phoneNumber}`;
        return this.data.users[phoneNumber][key] || { enabled: false, emoji: '👀' };
    }

    setMentionReact(phoneNumber, value, userPhone) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        const key = `mentionReact_${userPhone || phoneNumber}`;
        this.data.users[phoneNumber][key] = value;
        this.save('users');
    }

    // Returns array of { userPhone, emoji } for all users with mentionReact enabled
    getAllMentionReacts(phoneNumber) {
        if (!this.data.users[phoneNumber]) return [];
        const results = [];
        for (const [k, v] of Object.entries(this.data.users[phoneNumber])) {
            if (k.startsWith('mentionReact_') && v?.enabled && v?.emoji) {
                const userPhone = k.replace('mentionReact_', '');
                results.push({ userPhone, emoji: v.emoji });
            }
        }
        return results;
    }

    // ── Mention Message — keyed by the user's own phone number ─────────────
    getMentionMessage(phoneNumber, userPhone) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        const key = `mentionMsg_${userPhone || phoneNumber}`;
        return this.data.users[phoneNumber][key] || { enabled: false, message: '' };
    }

    setMentionMessage(phoneNumber, value, userPhone) {
        if (!this.data.users[phoneNumber]) this.data.users[phoneNumber] = {};
        const key = `mentionMsg_${userPhone || phoneNumber}`;
        this.data.users[phoneNumber][key] = value;
        this.save('users');
    }

    // Returns array of { userPhone, message } for all users with mentionMessage enabled
    getAllMentionMessages(phoneNumber) {
        if (!this.data.users[phoneNumber]) return [];
        const results = [];
        for (const [k, v] of Object.entries(this.data.users[phoneNumber])) {
            if (k.startsWith('mentionMsg_') && v?.enabled && v?.message) {
                const userPhone = k.replace('mentionMsg_', '');
                results.push({ userPhone, message: v.message });
            }
        }
        return results;
    }

}

module.exports = new Database();

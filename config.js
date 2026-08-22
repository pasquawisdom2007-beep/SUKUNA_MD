/**
 * SUKUNA MD - Configuration File
 * Multi-User WhatsApp Bot
 */

module.exports = {
    botName: 'SUKUNA MD',
    version: '3.0.0',
    prefix: '.',

    // ============================================
    // ASSETS
    // ============================================
    assets: {
        menuVideo: './assets/menuvideo.mp4',
        menuThumb: './assets/menuthumb.jpg'
    },

    // ============================================
    // BOT OWNER INFO
    // ============================================
    ownerNumber: process.env.OWNER_NUMBER || '2349127857212',
    pairNumber:  process.env.PAIR_NUMBER  || '2349127857212',

    // ============================================
    // SESSION ID (skip pair code, auto-connect)
    // --------------------------------------------
    // Paste the SESSION_ID you got from the pair site (base64 of creds.json).
    // • If set    → bot decodes it, writes sessions/<pairNumber>/creds.json,
    //               and connects directly WITHOUT printing a pairing code.
    // • If empty  → bot falls back to the normal 8-char pairing-code flow.
    // Use ONE flow at a time — don't try to set both.
    // ============================================
    sessionId: process.env.SESSION_ID || '',

    owner: {
        name:     'PASQUA',
        number:   process.env.OWNER_NUMBER || '2349127857212',
        github:   'https://github.com/pasquawisdom2007-beep/Sukuna-MD-V3',
        channel:  'https://whatsapp.com/channel/0029VbCJho147XeEEuR1LA3s',
        telegram: 't.me/Pasquaking',
    },

    sessions: {
        folder: './sessions/',
        autoReconnect: true
    },

    groupDefaults: {
        antilink: false,
        antilinkAction: 'delete',
        antimention: false,
        antimentionMode: 'normal',
        antimentionAction: 'warn',
        antimentionMax: 5,
        welcome: false,
        welcomeMessage: '👋 Welcome @user to @group!',
        goodbye: false,
        goodbyeMessage: '👋 Goodbye @user!',
        mute: false
    },

    apiKeys: {
        openai: process.env.OPENAI_API_KEY || '',
        weather: process.env.WEATHER_API_KEY || '',
        imgbb: process.env.IMGBB_API_KEY || 'dada6d77f27b31a3f28c30f61728cedf',
        klipy: process.env.KLIPY_API_KEY || 'x98VATj2HVtGsRNU3ca07NZFreZL22DUD5NMbXillsC4yTGuWR40E1H9SUJc5uS9'
    },

    messages: {
        wait: '⏳ Processing...',
        success: '✅ Success!',
        error: '❌ Error occurred!',
        adminOnly: '🛡️ This command is only for admins!',
        groupOnly: '👥 This command can only be used in groups!',
        botAdminNeeded: '🤖 Bot needs to be admin to execute this command!'
    },

    // ============================================
    // OUTBOUND SAFETY THROTTLE
    // ============================================
    antiBan: {
        enabled: true,
        maxMessagesPerSecond: 1,
        messageRateLimit: 1000,
        apiThrottleMs: 1000,
        autoPauseThreshold: 5,
        autoPauseDuration: 180000
    }
};

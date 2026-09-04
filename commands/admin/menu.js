/**
 * .menu — SUKUNA MD main menu
 *
 * - Honors .setdesign (reads database.getMenuDesign + buildCaption from
 *   utils/menuDesigns). Falls back to the original PASQUA TECH layout if
 *   the design module fails for any reason.
 * - Sends the menu video as a REAL video (with audio). The previous
 *   version forced gifPlayback:true, which made WhatsApp render it as a
 *   silent GIF.
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');
const config         = require('../../config');
const commandLoader  = require('../../utils/commandLoader');
const database       = require('../../utils/database');
const { buildCaption } = require('../../utils/menuDesigns');
const { boldItalic } = require('../../utils/styleBox');
const { sendChromaMenu } = require('../../utils/chromaMenu');
const fontSystem     = require('../../utils/fontSystem');
const langSystem     = require('../../utils/langSystem');

const VIDEO_PATH  = path.join(__dirname, '..', '..', 'assets', 'menuvideo.mp4');
const IMAGE_PATH  = path.join(__dirname, '..', '..', 'assets', 'menuimage.jpg');
const GIF_PATH    = path.join(__dirname, '..', '..', 'assets', 'menugif.mp4');


function fmtUptime(sec) {
    sec = Math.floor(sec);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d) return `${d}d ${h}h ${m}m ${s}s`;
    return `${h}h ${m}m ${s}s`;
}

function fmtMB(bytes) {
    return Math.round(bytes / 1024 / 1024) + 'MB';
}

function pad2(n) { return String(n).padStart(2, '0'); }

const CATEGORY_LABELS = {
    owner:      'OWNER',
    admin:      'ADMIN',
    moderation: 'MODERATION',
    economy:    'ECONOMY',
    fun:        'FUN',
    media:      'MEDIA',
    ai:         'AI',
    utility:    'UTILITY',
    group:      'GROUP',
    general:    'GENERAL',
    unicode:    'UNICODE',
    '18plus':   '18PLUS',
    textmaker:  'TEXTMAKER',
    'anime-nsfw': 'ANIME NSFW (18+)',
};

const CATEGORY_ORDER = [
    'owner', 'admin', 'moderation', 'economy', 'fun', 'media',
    'ai', 'utility', 'group', 'general', 'unicode', '18plus', 'textmaker', 'anime-nsfw',
];

// ── Fallback caption (Peak Rail — matches the default `nor` design) ──
function buildFallbackCaption(ctx) {
    const {
        senderNumber, ownerName, prefix, mode, uptime,
        ramUsed, ramTotal, cmdCount, version, date, time,
        sortedCategories, byCategory, t,
    } = ctx;

    const RULE = '━━━━━━━━━━━━━━━━━━';
    let c = '';

    // Peak header
    c += `◤${RULE}◥\n`;
    c += `      ✦ *${ctx.botName || 'SUKUNA MD'}* ✦\n`;
    c += `◣${RULE}◢\n`;

    // Info rail
    c += ` ▐ User     : @${senderNumber}\n`;
    c += ` ▐ Creator  : ${ownerName}\n`;
    c += ` ▐ Mode     : ${mode}\n`;
    c += ` ▐ Plugins  : ${cmdCount}\n`;
    c += ` ▐ Uptime   : ${uptime}\n`;
    c += ` ▐ Prefix   : ${prefix}\n`;
    c += ` ▐ Version  : v${version}\n`;
    c += ` ▐ Ram      : ${ramUsed} / ${ramTotal}\n`;
    c += ` ▐ Date     : ${date}\n`;
    c += ` ▐ Time     : ${time}\n`;
    c += ` ▐ Status   : Online ✅\n`;
    c += `${RULE}━━\n\n`;

    // Categories — boxed, one command per line
    for (const cat of sortedCategories) {
        const list = byCategory[cat];
        if (!list || !list.length) continue;
        const tKey = 'cat.' + cat;
        const label = (t && t(tKey) !== tKey) ? t(tKey) : (CATEGORY_LABELS[cat] || cat.toUpperCase());
        c += `┏━ ${String(label).toUpperCase()} ━┓\n`;
        for (const n of [...list].sort()) c += ` ▸ ${n}\n`;
        c += `┗━━━━━━━━━━━━━━━━┛\n\n`;
    }

    // Peak footer
    c += `◤${RULE}◥\n`;
    c += `   ${cmdCount} commands loaded\n`;
    c += `◣${RULE}◢\n`;
    c += `\n> *${ctx.botName || 'SUKUNA MD'}* · King of Curses · by ${ownerName}`;

    return c;
}

module.exports = {
    name: 'menu',
    aliases: ['help', 'list', 'commands'],
    description: 'Show the SUKUNA MD command menu',
    category: 'admin',

    async execute({ sock, msg, from, sender, reply, phoneNumber, args = [], t: _t }) {
        // Use the language translator passed from sessionManager, fallback to English
        const t = _t || langSystem.getTranslator('english');
        // `.list <category>` is a focused command list; bare `.list` keeps the
        // original full menu because `list` is an alias of `menu`.
        const requestedCategory = String(args[0] || '').trim().toLowerCase();
        if (requestedCategory) {
            const categoryAliases = { owners: 'owner', admins: 'admin', mods: 'moderation', mod: 'moderation',
                groups: 'group', utilities: 'utility', ai: 'ai', games: 'games', nfsw: 'anime-nsfw' };
            const category = categoryAliases[requestedCategory] || requestedCategory;
            const commands = commandLoader.getAll()
                .filter(command => String(command.category || '').toLowerCase() === category)
                .sort((a, b) => a.name.localeCompare(b.name));
            if (!commands.length) {
                const available = [...new Set(commandLoader.getAll().map(command => command.category))].sort();
                return reply(`❌ Category *${requestedCategory}* was not found or has no commands.\n\nAvailable: ${available.join(', ')}`);
            }
            const label = CATEGORY_LABELS[category] || category.toUpperCase();
            const lines = commands.map(command => `▸ ${command.name}`);
            return reply(`╭━━━ ${label} COMMANDS ━━━╮\n│ ${lines.join('\n│ ')}\n╰━━━ ${commands.length} commands ━━━╯`);
        }
        // Keep the menu response lightweight: acknowledge the command with one
        // reaction, then send the menu without a loading animation or edits.
        try {
            await sock.sendMessage(from, { react: { text: '🪀', key: msg.key } });
        } catch (_) { /* reaction failures must not block the menu */ }

        const commands = commandLoader.commands || new Map();

        // Group commands by category (dedupe by name; aliases excluded).
        const byCategory = {};
        for (const [name, cmd] of commands.entries()) {
            const cat = (cmd.category || 'general').toLowerCase();
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(name);
        }
        for (const k of Object.keys(byCategory)) byCategory[k].sort();

        const seen = new Set(CATEGORY_ORDER);
        const sortedCategories = [
            ...CATEGORY_ORDER,
            ...Object.keys(byCategory).filter(c => !seen.has(c)),
        ].filter(c => byCategory[c]?.length);

        // Build identity / runtime info
        const senderJid    = sender || msg?.key?.participant || msg?.key?.remoteJid || '';
        const senderNumber = String(phoneNumber || senderJid).replace(/[^0-9]/g, '') || 'user';
        const botName      = config.botName || 'SUKUNA MD';
        const ownerName    = (config.owner && config.owner.name) || 'PASQUA';
        const prefix       = config.prefix || '.';
        const mode         = (global.botMode || config.mode || 'private').toLowerCase();
        const version      = config.version || '3.0.0';

        const uptime = fmtUptime(process.uptime());
        const mem    = process.memoryUsage();
        const ramUsed  = fmtMB(mem.rss);
        const ramTotal = fmtMB(os.totalmem() > mem.rss * 4 ? mem.rss * 2.6 : os.totalmem());
        const cmdCount = commands.size;

        const now  = new Date();
        const date = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
        const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

        // Runtime status / platform (some designs reference these — without
        // them the rendered menu shows "undefined").
        const status   = 'Online ✅';
        const platform = `${os.platform()} ${os.arch()}`;
        const speed    = 'ultra fast';
        const library  = '@pasqua-baileys/baileys';
        const credits  = 'pasqua tech';

        // ── Resolve current menu design ──
        let designKey = 'pasqua';
        try { designKey = (database.getMenuDesign(phoneNumber) || 'pasqua').toLowerCase(); }
        catch (_) {}

        // ── Resolve the active font once so every text path uses it ──
        let activeFontNum = 1;
        try { activeFontNum = database.getFont(phoneNumber) || 1; } catch (_) {}

        // Pass a plain passthrough for boldItalic into the design context.
        // Designs call boldItalic() on header/title text — if we let it run
        // its default Unicode conversion those chars end up in a different
        // block and fontSystem.convert can no longer reach them.
        // By making it a no-op here, all text stays as plain Latin so the
        // font apply step below can convert every word uniformly.
        const plainText = (str) => String(str);

        const designCtx = {
            botName,
            userTag:  `@${senderNumber}`,
            creator:  ownerName,
            mode,
            total:    cmdCount,
            uptime,
            prefix,
            version,
            ramUsed,
            ramTotal,
            date,
            time,
            status,
            platform,
            speed,
            library,
            credits,
            // common aliases used by various design templates
            user:        `@${senderNumber}`,
            owner:       ownerName,
            ownerName,
            cmdCount,
            commands:    cmdCount,
            ram:         `${ramUsed} / ${ramTotal}`,
            sortedCategories,
            byCategory,
            CATEGORY_LABELS,
            boldItalic:  plainText,  // keep text as plain Latin so font apply hits it
            t,                        // translator — designs can use t('cat.owner') etc.
        };

        let caption;
        try {
            caption = buildCaption(designKey, designCtx);
            if (!caption || typeof caption !== 'string') throw new Error('empty caption');
        } catch (e) {
            console.error('[menu] buildCaption failed, using fallback:', e.message);
            caption = buildFallbackCaption({
                senderNumber, botName, ownerName, prefix, mode, uptime,
                ramUsed, ramTotal, cmdCount, version, date, time,
                sortedCategories, byCategory, t,
            });
        }

        // ===== Read More — force WhatsApp to collapse right after the
        // info header, so tapping "Read more" reveals the category list. =====
        // Must run on the raw caption, before font conversion, while
        // "Platform" is still plain ASCII and reliably matchable — the
        // marker itself (an RTL mark + spaces) survives font conversion
        // untouched either way since fontSystem only maps a-z/0-9.
        // Zero-width space (U+200B) instead of a real space — it still
        // counts toward WhatsApp's caption-length cutoff (so the collapse
        // still happens right here), but it renders as nothing, so there's
        // no visible blank gap before "Read more" like a plain space causes.
        const READ_MORE = String.fromCharCode(8206) + '\u200B'.repeat(4000);
        const anchorLine = caption.match(/^.*latform.*$/im) || caption.match(/^.*status.*$/im);
        if (anchorLine) {
            const cutAt = caption.indexOf(anchorLine[0]) + anchorLine[0].length;
            caption = caption.slice(0, cutAt) + '\n' + READ_MORE + caption.slice(cutAt);
        } else {
            // No recognizable anchor (custom/unknown design) — fall back
            // to the old behavior rather than breaking the menu.
            caption = caption + READ_MORE;
        }

        // ===== Apply active font to ALL text in the caption =====
        // fontSystem.convert only maps plain Latin a-z A-Z 0-9 — every
        // box-drawing char, emoji, symbol and @mention passes through intact.
        // Because we used plainText above instead of boldItalic(), headers and
        // category labels are still plain Latin here and get converted too.
        if (activeFontNum !== 1) {
            try { caption = fontSystem.convert(caption, activeFontNum); } catch (_) {}
        }

        const mentions = senderJid ? [senderJid] : [];

        try {
            // Flag sock to skip the newsletter branding on the next sendMessage call.
            // The flag is auto-cleared inside newsletterBrand.wrapSocket after each send.
            // Must be set before EACH send because the delete call above also consumes it.
            sock.__skipBrand = true;

            // Chroma is a GenAI-rich HTML menu with three button columns.
            // It intentionally bypasses the legacy image/video menu path so
            // the selected design behaves like the interactive TTT and Snake
            // commands.
            if (designKey === 'chroma') {
                return await sendChromaMenu({
                    sock,
                    jid: from,
                    quoted: msg,
                    caption,
                    prefix,
                    commands,
                    botName,
                    userTag: `@${senderNumber}`,
                    version,
                    uptime,
                    status,
                });
            }

            // Priority: menu image > menu GIF (gifPlayback loop) > menu video > text
            if (fs.existsSync(IMAGE_PATH)) {
                return await sock.sendMessage(
                    from,
                    {
                        image: fs.readFileSync(IMAGE_PATH),
                        caption,
                        mentions,
                    },
                    { quoted: msg }
                );
            }
            if (fs.existsSync(GIF_PATH)) {
                // GIF playback: WhatsApp loops the video silently and continuously
                sock.__skipBrand = true;
                return await sock.sendMessage(
                    from,
                    {
                        video:       fs.readFileSync(GIF_PATH),
                        mimetype:    'video/mp4',
                        gifPlayback: true,
                        caption,
                        mentions,
                    },
                    { quoted: msg }
                );
            }
            if (fs.existsSync(VIDEO_PATH)) {
                // Keep this as a normal inline video (not a document and not
                // gifPlayback), but pass the file URL so Baileys streams the
                // original stored bytes without an extra fs.readFileSync copy.
                // This preserves the highest quality available in the source;
                // WhatsApp may still apply its own server-side video policy.
                sock.__skipBrand = true;
                return await sock.sendMessage(
                    from,
                    {
                        video:    { url: VIDEO_PATH },
                        mimetype: 'video/mp4',
                        caption,
                        mentions,
                    },
                    { quoted: msg }
                );
            }
            sock.__skipBrand = true;
            return await sock.sendMessage(
                from,
                { text: caption, mentions },
                { quoted: msg }
            );
        } catch (e) {
            console.error('[menu] send failed:', e.message);
            return reply(caption);
        }
    },
};

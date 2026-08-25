/**
 * langSystem.js — Global language / i18n system for SUKUNA MD
 *
 * Add a new language by adding an entry to DICTIONARY below.
 * Every key in 'english' MUST also exist in every other language block.
 *
 * Usage:
 *   const lang = require('./langSystem');
 *   const t    = lang.getTranslator(database.getLanguage(phoneNumber));
 *   reply(t('ping.response', { latency: '42ms' }));
 */

'use strict';

// ── Language dictionary ───────────────────────────────────────────────────────
const DICTIONARY = {

    // ─── English (default) ──────────────────────────────────────────────────
    english: {
        // General
        'general.wait':         '⏳ Please wait...',
        'general.success':      '✅ Done!',
        'general.error':        '❌ An error occurred. Please try again.',
        'general.adminOnly':    '🛡️ This command is for admins only!',
        'general.groupOnly':    '👥 This command can only be used in groups!',
        'general.ownerOnly':    '🔒 This command is reserved for the bot owner.',
        'general.botAdminNeeded': '🤖 I need to be a group admin to do this!',
        'general.invalidArgs':  '❌ Invalid arguments. Check the usage and try again.',

        // Ping
        'ping.checking':        '⏳ *Getting status...*',
        'ping.fast':            'Fast',
        'ping.good':            'Good',
        'ping.okay':            'Okay',
        'ping.slow':            'Slow',

        // Alive
        'alive.status':         'Online & Running',
        'alive.uptime':         'Uptime',
        'alive.date':           'Date',
        'alive.time':           'Time',
        'alive.prefix':         'Prefix',
        'alive.version':        'Version',
        'alive.owner':          'Owner',
        'alive.powered':        'Powered by the King of Curses',

        // Menu
        'menu.domainIntro':     '🔮 *Domain Expansion........*\n\n_Malevolent Shrine — Unlimited Void_\n\n> 👹 The King of Curses opens the menu...',
        'menu.prefix':          '⚡  *Prefix* › `{prefix}`',
        'menu.version':         '📦  *Version* › {version}',
        'menu.creator':         '👑  *Creator* › {creator}',
        'menu.totalCommands':   '📊  *Total Commands:* {count}',
        'menu.powered':         '> 🔥 _{botName} — Powered by the King of Curses_',
        'menu.commands':        'COMMANDS',
        'menu.buttonFooter':    'Tap a button below for quick actions!',

        // Menu category labels
        'cat.owner':            'OWNER',
        'cat.admin':            'ADMIN',
        'cat.moderation':       'MODERATION',
        'cat.fun':              'FUN',
        'cat.media':            'MEDIA',
        'cat.ai':               'AI',
        'cat.utility':          'UTILITY',
        'cat.group':            'GROUP',
        'cat.general':          'GENERAL',

        // Play
        'play.searching':       '🔍 Searching: *{query}*...',
        'play.downloading':     '⬇️ Downloading: *{title}*...',
        'play.success':         '✅ *{title}*\n🎵 Enjoy your music!',
        'play.notFound':        '❌ Could not find or download *{query}*\n\n💡 Tips:\n• Add artist name: `.play Essence Wizkid`\n• Try the full song title\n• Use a direct YouTube link: `.play https://youtu.be/...`',
        'play.downloadFail':    '❌ Download failed: {error}\n\n💡 Try: `.play <different song name>` or a direct YouTube link.',
        'play.noQuery':         '🎵 *Usage:* .play <song name>\n*Example:* .play Essence Wizkid\n\nSupports song names, YouTube & Spotify links.',
        'play.thumbCaption':    '🎵 *{title}*\n👤 *Artist:* {artist}\n⏱️ *Duration:* {duration}\n\n⬇️ Downloading audio...',
        'play.fileTooSmall':    '❌ Download returned an empty file. Try again.',

        // Sticker commands
        'setcmd.set':           '✅ *Sticker Command Set!*\nCommand: `.{cmd}`',
        'setcmd.updated':       '✏️ *Updated!* Old: `{old}` → New: `{cmd}`',
        'setcmd.noSticker':     '❌ Please reply to a sticker.',
        'setcmd.unknownCmd':    '❌ Unknown command: *{cmd}*',
        'unsetcmd.removed':     '🗑️ Binding to `.{cmd}` removed.',
        'unsetcmd.notFound':    '⚠️ This sticker has no binding.',
        'cmdlist.empty':        '📋 No sticker bindings in this group yet.',
        'cmdlist.header':       '📋 *Sticker Command Bindings*',
        'cmdlist.total':        'Total: *{count}* binding(s)',

        // Language
        'lang.set':             '🌍 Language set to *{lang}*! All responses will now be in {lang}.',
        'lang.current':         '🌍 Current language: *{lang}*',
        'lang.unknown':         '❌ Unknown language: *{lang}*\nAvailable: {available}',
        'lang.noChange':        '⚠️ Language is already set to *{lang}*.',

        // Welcome / Goodbye
        'welcome.default':      '👋 Welcome @user to @group!',
        'goodbye.default':      '👋 Goodbye @user! We\'ll miss you.',

        // Warnings
        'warn.issued':          '⚠️ *Warning {count}/{max}* issued to @user.',
        'warn.maxReached':      '🚨 @user has reached {max} warnings and has been removed.',
        'warn.reset':           '✅ Warnings reset for @user.',

        // Errors
        'error.timeout':        '⏰ Request timed out. Try again.',
        'error.noResult':       '😔 No results found for: *{query}*',
        'error.fileTooSmall':   '❌ Download returned an empty file. Try again.',
    },

    // ─── French ─────────────────────────────────────────────────────────────
    french: {
        'general.wait':         '⏳ Veuillez patienter...',
        'general.success':      '✅ Terminé !',
        'general.error':        '❌ Une erreur est survenue. Veuillez réessayer.',
        'general.adminOnly':    '🛡️ Cette commande est réservée aux administrateurs !',
        'general.groupOnly':    '👥 Cette commande ne peut être utilisée que dans les groupes !',
        'general.ownerOnly':    '🔒 Cette commande est réservée au propriétaire du bot.',
        'general.botAdminNeeded': '🤖 Je dois être administrateur pour faire ça !',
        'general.invalidArgs':  '❌ Arguments invalides. Vérifiez l\'utilisation et réessayez.',

        'ping.checking':        '⏳ *Vérification du statut...*',
        'ping.fast':            'Rapide',
        'ping.good':            'Bon',
        'ping.okay':            'Correct',
        'ping.slow':            'Lent',

        'alive.status':         'En ligne et actif',
        'alive.uptime':         'Temps de fonctionnement',
        'alive.date':           'Date',
        'alive.time':           'Heure',
        'alive.prefix':         'Préfixe',
        'alive.version':        'Version',
        'alive.owner':          'Propriétaire',
        'alive.powered':        'Propulsé par le Roi des Fléaux',

        'menu.domainIntro':     '🔮 *Expansion du Domaine........*\n\n_Sanctuaire Malveillant — Vide Illimité_\n\n> 👹 Le Roi des Fléaux ouvre le menu...',
        'menu.prefix':          '⚡  *Préfixe* › `{prefix}`',
        'menu.version':         '📦  *Version* › {version}',
        'menu.creator':         '👑  *Créateur* › {creator}',
        'menu.totalCommands':   '📊  *Total des commandes :* {count}',
        'menu.powered':         '> 🔥 _{botName} — Propulsé par le Roi des Fléaux_',
        'menu.commands':        'COMMANDES',
        'menu.buttonFooter':    'Appuyez sur un bouton pour une action rapide !',

        'cat.owner':            'PROPRIÉTAIRE',
        'cat.admin':            'ADMIN',
        'cat.moderation':       'MODÉRATION',
        'cat.fun':              'DIVERTISSEMENT',
        'cat.media':            'MÉDIA',
        'cat.ai':               'IA',
        'cat.utility':          'UTILITAIRE',
        'cat.group':            'GROUPE',
        'cat.general':          'GÉNÉRAL',

        'play.searching':       '🔍 Recherche : *{query}*...',
        'play.downloading':     '⬇️ Téléchargement : *{title}*...',
        'play.success':         '✅ *{title}*\n🎵 Profitez de la musique !',
        'play.notFound':        '❌ Impossible de trouver *{query}*\n\n💡 Conseils :\n• Ajoutez le nom de l\'artiste : `.play Essence Wizkid`\n• Essayez le titre complet\n• Utilisez un lien YouTube : `.play https://youtu.be/...`',
        'play.downloadFail':    '❌ Échec du téléchargement : {error}\n\n💡 Essayez : `.play <autre chanson>` ou un lien direct.',
        'play.noQuery':         '🎵 *Utilisation :* .play <nom de la chanson>\n*Exemple :* .play Essence Wizkid\n\nSupporte les noms, liens YouTube et Spotify.',
        'play.thumbCaption':    '🎵 *{title}*\n👤 *Artiste :* {artist}\n⏱️ *Durée :* {duration}\n\n⬇️ Téléchargement en cours...',
        'play.fileTooSmall':    '❌ Le fichier téléchargé est vide. Réessayez.',

        'setcmd.set':           '✅ *Commande de sticker définie !*\nCommande : `.{cmd}`',
        'setcmd.updated':       '✏️ *Mise à jour !* Ancienne : `{old}` → Nouvelle : `{cmd}`',
        'setcmd.noSticker':     '❌ Veuillez répondre à un sticker.',
        'setcmd.unknownCmd':    '❌ Commande inconnue : *{cmd}*',
        'unsetcmd.removed':     '🗑️ Liaison à `.{cmd}` supprimée.',
        'unsetcmd.notFound':    '⚠️ Ce sticker n\'a aucune liaison.',
        'cmdlist.empty':        '📋 Aucune liaison de sticker dans ce groupe.',
        'cmdlist.header':       '📋 *Liaisons Commande-Sticker*',
        'cmdlist.total':        'Total : *{count}* liaison(s)',

        'lang.set':             '🌍 Langue définie sur *{lang}* ! Toutes les réponses seront en {lang}.',
        'lang.current':         '🌍 Langue actuelle : *{lang}*',
        'lang.unknown':         '❌ Langue inconnue : *{lang}*\nDisponibles : {available}',
        'lang.noChange':        '⚠️ La langue est déjà définie sur *{lang}*.',

        'welcome.default':      '👋 Bienvenue @user dans @group !',
        'goodbye.default':      '👋 Au revoir @user ! Tu vas nous manquer.',

        'warn.issued':          '⚠️ *Avertissement {count}/{max}* donné à @user.',
        'warn.maxReached':      '🚨 @user a atteint {max} avertissements et a été retiré.',
        'warn.reset':           '✅ Avertissements réinitialisés pour @user.',

        'error.timeout':        '⏰ Délai dépassé. Réessayez.',
        'error.noResult':       '😔 Aucun résultat pour : *{query}*',
        'error.fileTooSmall':   '❌ Le téléchargement a retourné un fichier vide. Réessayez.',
    },

    // ─── Spanish ─────────────────────────────────────────────────────────────
    spanish: {
        'general.wait':         '⏳ Por favor espera...',
        'general.success':      '✅ ¡Listo!',
        'general.error':        '❌ Ocurrió un error. Por favor inténtalo de nuevo.',
        'general.adminOnly':    '🛡️ ¡Este comando es solo para administradores!',
        'general.groupOnly':    '👥 ¡Este comando solo se puede usar en grupos!',
        'general.ownerOnly':    '🔒 Este comando es exclusivo para el dueño del bot.',
        'general.botAdminNeeded': '🤖 ¡Necesito ser administrador para hacer esto!',
        'general.invalidArgs':  '❌ Argumentos inválidos. Revisa el uso e inténtalo de nuevo.',

        'ping.checking':        '⏳ *Verificando estado...*',
        'ping.fast':            'Rápido',
        'ping.good':            'Bueno',
        'ping.okay':            'Aceptable',
        'ping.slow':            'Lento',

        'alive.status':         'En línea y funcionando',
        'alive.uptime':         'Tiempo activo',
        'alive.date':           'Fecha',
        'alive.time':           'Hora',
        'alive.prefix':         'Prefijo',
        'alive.version':        'Versión',
        'alive.owner':          'Dueño',
        'alive.powered':        'Impulsado por el Rey de las Maldiciones',

        'menu.domainIntro':     '🔮 *Expansión de Dominio........*\n\n_Santuario Malévolo — Vacío Ilimitado_\n\n> 👹 El Rey de las Maldiciones abre el menú...',
        'menu.prefix':          '⚡  *Prefijo* › `{prefix}`',
        'menu.version':         '📦  *Versión* › {version}',
        'menu.creator':         '👑  *Creador* › {creator}',
        'menu.totalCommands':   '📊  *Total de comandos:* {count}',
        'menu.powered':         '> 🔥 _{botName} — Impulsado por el Rey de las Maldiciones_',
        'menu.commands':        'COMANDOS',
        'menu.buttonFooter':    '¡Toca un botón para una acción rápida!',

        'cat.owner':            'DUEÑO',
        'cat.admin':            'ADMIN',
        'cat.moderation':       'MODERACIÓN',
        'cat.fun':              'DIVERSIÓN',
        'cat.media':            'MEDIA',
        'cat.ai':               'IA',
        'cat.utility':          'UTILIDAD',
        'cat.group':            'GRUPO',
        'cat.general':          'GENERAL',

        'play.searching':       '🔍 Buscando: *{query}*...',
        'play.downloading':     '⬇️ Descargando: *{title}*...',
        'play.success':         '✅ *{title}*\n🎵 ¡Disfruta la música!',
        'play.notFound':        '❌ No se pudo encontrar *{query}*\n\n💡 Consejos:\n• Agrega el nombre del artista: `.play Essence Wizkid`\n• Prueba el título completo\n• Usa un enlace de YouTube: `.play https://youtu.be/...`',
        'play.downloadFail':    '❌ Descarga fallida: {error}\n\n💡 Intenta: `.play <otra canción>` o un enlace directo.',
        'play.noQuery':         '🎵 *Uso:* .play <nombre de la canción>\n*Ejemplo:* .play Essence Wizkid\n\nSoporta nombres, enlaces de YouTube y Spotify.',
        'play.thumbCaption':    '🎵 *{title}*\n👤 *Artista:* {artist}\n⏱️ *Duración:* {duration}\n\n⬇️ Descargando audio...',
        'play.fileTooSmall':    '❌ La descarga devolvió un archivo vacío. Inténtalo de nuevo.',

        'setcmd.set':           '✅ *¡Comando de sticker configurado!*\nComando: `.{cmd}`',
        'setcmd.updated':       '✏️ *¡Actualizado!* Anterior: `{old}` → Nuevo: `{cmd}`',
        'setcmd.noSticker':     '❌ Por favor responde a un sticker.',
        'setcmd.unknownCmd':    '❌ Comando desconocido: *{cmd}*',
        'unsetcmd.removed':     '🗑️ Vinculación a `.{cmd}` eliminada.',
        'unsetcmd.notFound':    '⚠️ Este sticker no tiene vinculación.',
        'cmdlist.empty':        '📋 No hay vinculaciones de sticker en este grupo.',
        'cmdlist.header':       '📋 *Vinculaciones Sticker-Comando*',
        'cmdlist.total':        'Total: *{count}* vinculación(es)',

        'lang.set':             '🌍 Idioma configurado a *{lang}*! Todas las respuestas serán en {lang}.',
        'lang.current':         '🌍 Idioma actual: *{lang}*',
        'lang.unknown':         '❌ Idioma desconocido: *{lang}*\nDisponibles: {available}',
        'lang.noChange':        '⚠️ El idioma ya está en *{lang}*.',

        'welcome.default':      '👋 ¡Bienvenido @user a @group!',
        'goodbye.default':      '👋 ¡Adiós @user! Te extrañaremos.',

        'warn.issued':          '⚠️ *Advertencia {count}/{max}* emitida a @user.',
        'warn.maxReached':      '🚨 @user ha alcanzado {max} advertencias y ha sido eliminado.',
        'warn.reset':           '✅ Advertencias reiniciadas para @user.',

        'error.timeout':        '⏰ Tiempo agotado. Inténtalo de nuevo.',
        'error.noResult':       '😔 Sin resultados para: *{query}*',
        'error.fileTooSmall':   '❌ La descarga devolvió un archivo vacío. Inténtalo de nuevo.',
    },

    // ─── Portuguese ──────────────────────────────────────────────────────────
    portuguese: {
        'general.wait':         '⏳ Por favor aguarde...',
        'general.success':      '✅ Feito!',
        'general.error':        '❌ Ocorreu um erro. Por favor tente novamente.',
        'general.adminOnly':    '🛡️ Este comando é apenas para administradores!',
        'general.groupOnly':    '👥 Este comando só pode ser usado em grupos!',
        'general.ownerOnly':    '🔒 Este comando é reservado ao dono do bot.',
        'general.botAdminNeeded': '🤖 Preciso ser administrador para fazer isso!',
        'general.invalidArgs':  '❌ Argumentos inválidos. Verifique o uso e tente novamente.',

        'ping.checking':        '⏳ *Verificando status...*',
        'ping.fast':            'Rápido',
        'ping.good':            'Bom',
        'ping.okay':            'Aceitável',
        'ping.slow':            'Lento',

        'alive.status':         'Online e funcionando',
        'alive.uptime':         'Tempo ativo',
        'alive.date':           'Data',
        'alive.time':           'Hora',
        'alive.prefix':         'Prefixo',
        'alive.version':        'Versão',
        'alive.owner':          'Dono',
        'alive.powered':        'Movido pelo Rei das Maldições',

        'menu.domainIntro':     '🔮 *Expansão de Domínio........*\n\n_Santuário Malévolo — Vazio Ilimitado_\n\n> 👹 O Rei das Maldições abre o menu...',
        'menu.prefix':          '⚡  *Prefixo* › `{prefix}`',
        'menu.version':         '📦  *Versão* › {version}',
        'menu.creator':         '👑  *Criador* › {creator}',
        'menu.totalCommands':   '📊  *Total de comandos:* {count}',
        'menu.powered':         '> 🔥 _{botName} — Movido pelo Rei das Maldições_',
        'menu.commands':        'COMANDOS',
        'menu.buttonFooter':    'Toque em um botão para uma ação rápida!',

        'cat.owner':            'DONO',
        'cat.admin':            'ADMIN',
        'cat.moderation':       'MODERAÇÃO',
        'cat.fun':              'DIVERSÃO',
        'cat.media':            'MÍDIA',
        'cat.ai':               'IA',
        'cat.utility':          'UTILIDADE',
        'cat.group':            'GRUPO',
        'cat.general':          'GERAL',

        'play.searching':       '🔍 Pesquisando: *{query}*...',
        'play.downloading':     '⬇️ Baixando: *{title}*...',
        'play.success':         '✅ *{title}*\n🎵 Aproveite a música!',
        'play.notFound':        '❌ Não foi possível encontrar *{query}*\n\n💡 Dicas:\n• Adicione o nome do artista: `.play Essence Wizkid`\n• Tente o título completo\n• Use um link do YouTube: `.play https://youtu.be/...`',
        'play.downloadFail':    '❌ Falha no download: {error}\n\n💡 Tente: `.play <outra música>` ou um link direto.',
        'play.noQuery':         '🎵 *Uso:* .play <nome da música>\n*Exemplo:* .play Essence Wizkid\n\nSuporta nomes, links do YouTube e Spotify.',
        'play.thumbCaption':    '🎵 *{title}*\n👤 *Artista:* {artist}\n⏱️ *Duração:* {duration}\n\n⬇️ Baixando áudio...',
        'play.fileTooSmall':    '❌ O download retornou um arquivo vazio. Tente novamente.',

        'setcmd.set':           '✅ *Comando de sticker definido!*\nComando: `.{cmd}`',
        'setcmd.updated':       '✏️ *Atualizado!* Antigo: `{old}` → Novo: `{cmd}`',
        'setcmd.noSticker':     '❌ Por favor responda a um sticker.',
        'setcmd.unknownCmd':    '❌ Comando desconhecido: *{cmd}*',
        'unsetcmd.removed':     '🗑️ Vínculo com `.{cmd}` removido.',
        'unsetcmd.notFound':    '⚠️ Este sticker não tem nenhum vínculo.',
        'cmdlist.empty':        '📋 Nenhum vínculo de sticker neste grupo.',
        'cmdlist.header':       '📋 *Vínculos Sticker-Comando*',
        'cmdlist.total':        'Total: *{count}* vínculo(s)',

        'lang.set':             '🌍 Idioma definido para *{lang}*! Todas as respostas serão em {lang}.',
        'lang.current':         '🌍 Idioma atual: *{lang}*',
        'lang.unknown':         '❌ Idioma desconhecido: *{lang}*\nDisponíveis: {available}',
        'lang.noChange':        '⚠️ O idioma já está em *{lang}*.',

        'welcome.default':      '👋 Bem-vindo @user ao @group!',
        'goodbye.default':      '👋 Tchau @user! Vamos sentir sua falta.',

        'warn.issued':          '⚠️ *Aviso {count}/{max}* dado a @user.',
        'warn.maxReached':      '🚨 @user atingiu {max} avisos e foi removido.',
        'warn.reset':           '✅ Avisos reiniciados para @user.',

        'error.timeout':        '⏰ Tempo esgotado. Tente novamente.',
        'error.noResult':       '😔 Nenhum resultado para: *{query}*',
        'error.fileTooSmall':   '❌ O download retornou um arquivo vazio. Tente novamente.',
    },

    // ─── Japanese ────────────────────────────────────────────────────────────
    japanese: {
        'general.wait':         '⏳ お待ちください...',
        'general.success':      '✅ 完了！',
        'general.error':        '❌ エラーが発生しました。もう一度お試しください。',
        'general.adminOnly':    '🛡️ このコマンドは管理者専用です！',
        'general.groupOnly':    '👥 このコマンドはグループでのみ使用できます！',
        'general.ownerOnly':    '🔒 このコマンドはボットオーナー専用です。',
        'general.botAdminNeeded': '🤖 これを行うにはボットが管理者である必要があります！',
        'general.invalidArgs':  '❌ 引数が無効です。使い方を確認してもう一度お試しください。',

        'ping.checking':        '⏳ *ステータスを確認中...*',
        'ping.fast':            '高速',
        'ping.good':            '良好',
        'ping.okay':            '普通',
        'ping.slow':            '遅い',

        'alive.status':         'オンライン＆稼働中',
        'alive.uptime':         '稼働時間',
        'alive.date':           '日付',
        'alive.time':           '時刻',
        'alive.prefix':         'プレフィックス',
        'alive.version':        'バージョン',
        'alive.owner':          'オーナー',
        'alive.powered':        '呪いの王によって駆動',

        'menu.domainIntro':     '🔮 *領域展開........*\n\n_伏魔御廚子 — 無量空処_\n\n> 👹 呪いの王がメニューを開く...',
        'menu.prefix':          '⚡  *プレフィックス* › `{prefix}`',
        'menu.version':         '📦  *バージョン* › {version}',
        'menu.creator':         '👑  *作成者* › {creator}',
        'menu.totalCommands':   '📊  *コマンド合計:* {count}',
        'menu.powered':         '> 🔥 _{botName} — 呪いの王によって駆動_',
        'menu.commands':        'コマンド',
        'menu.buttonFooter':    '下のボタンをタップしてください！',

        'cat.owner':            'オーナー',
        'cat.admin':            '管理者',
        'cat.moderation':       'モデレーション',
        'cat.fun':              '楽しみ',
        'cat.media':            'メディア',
        'cat.ai':               'AI',
        'cat.utility':          'ユーティリティ',
        'cat.group':            'グループ',
        'cat.general':          '一般',

        'play.searching':       '🔍 検索中: *{query}*...',
        'play.downloading':     '⬇️ ダウンロード中: *{title}*...',
        'play.success':         '✅ *{title}*\n🎵 音楽をお楽しみください！',
        'play.notFound':        '❌ *{query}* が見つかりませんでした\n\n💡 ヒント:\n• アーティスト名を追加: `.play Essence Wizkid`\n• フルタイトルを試す\n• YouTubeリンクを使用: `.play https://youtu.be/...`',
        'play.downloadFail':    '❌ ダウンロード失敗: {error}\n\n💡 `.play <別の曲名>` またはダイレクトリンクを試してください。',
        'play.noQuery':         '🎵 *使い方:* .play <曲名>\n*例:* .play Essence Wizkid\n\n曲名、YouTube＆Spotifyリンクに対応。',
        'play.thumbCaption':    '🎵 *{title}*\n👤 *アーティスト:* {artist}\n⏱️ *再生時間:* {duration}\n\n⬇️ オーディオをダウンロード中...',
        'play.fileTooSmall':    '❌ ダウンロードしたファイルが空です。もう一度お試しください。',

        'setcmd.set':           '✅ *スタンプコマンド設定完了！*\nコマンド: `.{cmd}`',
        'setcmd.updated':       '✏️ *更新！* 旧: `{old}` → 新: `{cmd}`',
        'setcmd.noSticker':     '❌ スタンプに返信してください。',
        'setcmd.unknownCmd':    '❌ 不明なコマンド: *{cmd}*',
        'unsetcmd.removed':     '🗑️ `.{cmd}` のバインディングを削除しました。',
        'unsetcmd.notFound':    '⚠️ このスタンプにはバインディングがありません。',
        'cmdlist.empty':        '📋 このグループにはスタンプバインディングがありません。',
        'cmdlist.header':       '📋 *スタンプコマンドバインディング*',
        'cmdlist.total':        '合計: *{count}* バインディング',

        'lang.set':             '🌍 言語が *{lang}* に設定されました！すべての応答は{lang}になります。',
        'lang.current':         '🌍 現在の言語: *{lang}*',
        'lang.unknown':         '❌ 不明な言語: *{lang}*\n利用可能: {available}',
        'lang.noChange':        '⚠️ 言語はすでに *{lang}* に設定されています。',

        'welcome.default':      '👋 @user さん、@group へようこそ！',
        'goodbye.default':      '👋 @user さん、さようなら！寂しくなります。',

        'warn.issued':          '⚠️ *警告 {count}/{max}* が @user に発行されました。',
        'warn.maxReached':      '🚨 @user は{max}回の警告に達し、削除されました。',
        'warn.reset':           '✅ @user の警告がリセットされました。',

        'error.timeout':        '⏰ リクエストがタイムアウトしました。もう一度お試しください。',
        'error.noResult':       '😔 *{query}* の結果が見つかりません',
        'error.fileTooSmall':   '❌ ダウンロードしたファイルが空です。もう一度お試しください。',
    },

    // ─── Chinese ─────────────────────────────────────────────────────────────
    chinese: {
        'general.wait':         '⏳ 请稍候...',
        'general.success':      '✅ 完成！',
        'general.error':        '❌ 发生错误。请重试。',
        'general.adminOnly':    '🛡️ 此命令仅限管理员使用！',
        'general.groupOnly':    '👥 此命令只能在群组中使用！',
        'general.ownerOnly':    '🔒 此命令仅限机器人所有者使用。',
        'general.botAdminNeeded': '🤖 我需要成为群管理员才能执行此操作！',
        'general.invalidArgs':  '❌ 参数无效。请检查用法后重试。',

        'ping.checking':        '⏳ *正在获取状态...*',
        'ping.fast':            '极速',
        'ping.good':            '良好',
        'ping.okay':            '一般',
        'ping.slow':            '缓慢',

        'alive.status':         '在线并运行中',
        'alive.uptime':         '运行时间',
        'alive.date':           '日期',
        'alive.time':           '时间',
        'alive.prefix':         '前缀',
        'alive.version':        '版本',
        'alive.owner':          '所有者',
        'alive.powered':        '由诅咒之王驱动',

        'menu.domainIntro':     '🔮 *领域展开........*\n\n_伏魔御厨子 — 无量空处_\n\n> 👹 诅咒之王打开菜单...',
        'menu.prefix':          '⚡  *前缀* › `{prefix}`',
        'menu.version':         '📦  *版本* › {version}',
        'menu.creator':         '👑  *创建者* › {creator}',
        'menu.totalCommands':   '📊  *命令总数:* {count}',
        'menu.powered':         '> 🔥 _{botName} — 由诅咒之王驱动_',
        'menu.commands':        '命令',
        'menu.buttonFooter':    '点击下方按钮快速操作！',

        'cat.owner':            '所有者',
        'cat.admin':            '管理员',
        'cat.moderation':       '审核',
        'cat.fun':              '娱乐',
        'cat.media':            '媒体',
        'cat.ai':               'AI',
        'cat.utility':          '工具',
        'cat.group':            '群组',
        'cat.general':          '通用',

        'play.searching':       '🔍 搜索中: *{query}*...',
        'play.downloading':     '⬇️ 下载中: *{title}*...',
        'play.success':         '✅ *{title}*\n🎵 享受音乐吧！',
        'play.notFound':        '❌ 无法找到 *{query}*\n\n💡 提示:\n• 添加艺人名: `.play Essence Wizkid`\n• 尝试完整标题\n• 使用YouTube链接: `.play https://youtu.be/...`',
        'play.downloadFail':    '❌ 下载失败: {error}\n\n💡 试试: `.play <其他歌曲>` 或直接链接。',
        'play.noQuery':         '🎵 *用法:* .play <歌曲名>\n*示例:* .play Essence Wizkid\n\n支持歌曲名、YouTube和Spotify链接。',
        'play.thumbCaption':    '🎵 *{title}*\n👤 *艺人:* {artist}\n⏱️ *时长:* {duration}\n\n⬇️ 正在下载音频...',
        'play.fileTooSmall':    '❌ 下载的文件为空。请重试。',

        'setcmd.set':           '✅ *贴纸命令已设置！*\n命令: `.{cmd}`',
        'setcmd.updated':       '✏️ *已更新！* 旧: `{old}` → 新: `{cmd}`',
        'setcmd.noSticker':     '❌ 请回复一个贴纸。',
        'setcmd.unknownCmd':    '❌ 未知命令: *{cmd}*',
        'unsetcmd.removed':     '🗑️ 与 `.{cmd}` 的绑定已移除。',
        'unsetcmd.notFound':    '⚠️ 此贴纸没有绑定。',
        'cmdlist.empty':        '📋 此群组中没有贴纸绑定。',
        'cmdlist.header':       '📋 *贴纸命令绑定*',
        'cmdlist.total':        '总计: *{count}* 个绑定',

        'lang.set':             '🌍 语言已设置为 *{lang}*！所有回复将使用{lang}。',
        'lang.current':         '🌍 当前语言: *{lang}*',
        'lang.unknown':         '❌ 未知语言: *{lang}*\n可用: {available}',
        'lang.noChange':        '⚠️ 语言已经设置为 *{lang}*。',

        'welcome.default':      '👋 欢迎 @user 加入 @group！',
        'goodbye.default':      '👋 再见 @user！我们会想念你的。',

        'warn.issued':          '⚠️ *警告 {count}/{max}* 已发给 @user。',
        'warn.maxReached':      '🚨 @user 已达到{max}次警告，已被移除。',
        'warn.reset':           '✅ @user 的警告已重置。',

        'error.timeout':        '⏰ 请求超时。请重试。',
        'error.noResult':       '😔 未找到 *{query}* 的结果',
        'error.fileTooSmall':   '❌ 下载的文件为空。请重试。',
    },

    // ─── Arabic ──────────────────────────────────────────────────────────────
    arabic: {
        'general.wait':         '⏳ يرجى الانتظار...',
        'general.success':      '✅ تم!',
        'general.error':        '❌ حدث خطأ. يرجى المحاولة مرة أخرى.',
        'general.adminOnly':    '🛡️ هذا الأمر للمشرفين فقط!',
        'general.groupOnly':    '👥 هذا الأمر يمكن استخدامه في المجموعات فقط!',
        'general.ownerOnly':    '🔒 هذا الأمر مخصص لمالك البوت فقط.',
        'general.botAdminNeeded': '🤖 أحتاج أن أكون مشرفاً لتنفيذ هذا!',
        'general.invalidArgs':  '❌ وسائط غير صالحة. تحقق من الاستخدام وحاول مرة أخرى.',

        'ping.checking':        '⏳ *جارٍ فحص الحالة...*',
        'ping.fast':            'سريع',
        'ping.good':            'جيد',
        'ping.okay':            'مقبول',
        'ping.slow':            'بطيء',

        'alive.status':         'متصل ويعمل',
        'alive.uptime':         'وقت التشغيل',
        'alive.date':           'التاريخ',
        'alive.time':           'الوقت',
        'alive.prefix':         'البادئة',
        'alive.version':        'الإصدار',
        'alive.owner':          'المالك',
        'alive.powered':        'مدعوم من ملك اللعنات',

        'menu.domainIntro':     '🔮 *توسيع النطاق........*\n\n_الضريح الخبيث — الفراغ اللامحدود_\n\n> 👹 ملك اللعنات يفتح القائمة...',
        'menu.prefix':          '⚡  *البادئة* › `{prefix}`',
        'menu.version':         '📦  *الإصدار* › {version}',
        'menu.creator':         '👑  *المنشئ* › {creator}',
        'menu.totalCommands':   '📊  *إجمالي الأوامر:* {count}',
        'menu.powered':         '> 🔥 _{botName} — مدعوم من ملك اللعنات_',
        'menu.commands':        'أوامر',
        'menu.buttonFooter':    'اضغط على زر أدناه للإجراء السريع!',

        'cat.owner':            'المالك',
        'cat.admin':            'المشرف',
        'cat.moderation':       'الإشراف',
        'cat.fun':              'ترفيه',
        'cat.media':            'وسائط',
        'cat.ai':               'ذكاء اصطناعي',
        'cat.utility':          'أدوات',
        'cat.group':            'مجموعة',
        'cat.general':          'عام',

        'play.searching':       '🔍 جارٍ البحث: *{query}*...',
        'play.downloading':     '⬇️ جارٍ التحميل: *{title}*...',
        'play.success':         '✅ *{title}*\n🎵 استمتع بالموسيقى!',
        'play.notFound':        '❌ لم يتم العثور على *{query}*\n\n💡 نصائح:\n• أضف اسم الفنان: `.play Essence Wizkid`\n• جرب العنوان الكامل\n• استخدم رابط يوتيوب: `.play https://youtu.be/...`',
        'play.downloadFail':    '❌ فشل التحميل: {error}\n\n💡 جرب: `.play <أغنية أخرى>` أو رابط مباشر.',
        'play.noQuery':         '🎵 *الاستخدام:* .play <اسم الأغنية>\n*مثال:* .play Essence Wizkid\n\nيدعم أسماء الأغاني وروابط يوتيوب وسبوتيفاي.',
        'play.thumbCaption':    '🎵 *{title}*\n👤 *الفنان:* {artist}\n⏱️ *المدة:* {duration}\n\n⬇️ جارٍ تحميل الصوت...',
        'play.fileTooSmall':    '❌ الملف المحمّل فارغ. حاول مرة أخرى.',

        'setcmd.set':           '✅ *تم تعيين أمر الملصق!*\nالأمر: `.{cmd}`',
        'setcmd.updated':       '✏️ *تم التحديث!* القديم: `{old}` → الجديد: `{cmd}`',
        'setcmd.noSticker':     '❌ يرجى الرد على ملصق.',
        'setcmd.unknownCmd':    '❌ أمر غير معروف: *{cmd}*',
        'unsetcmd.removed':     '🗑️ تم إزالة الربط مع `.{cmd}`.',
        'unsetcmd.notFound':    '⚠️ هذا الملصق ليس له ربط.',
        'cmdlist.empty':        '📋 لا توجد ربطات ملصقات في هذه المجموعة.',
        'cmdlist.header':       '📋 *ربطات أوامر الملصقات*',
        'cmdlist.total':        'الإجمالي: *{count}* ربط(ات)',

        'lang.set':             '🌍 تم تعيين اللغة إلى *{lang}*! جميع الردود ستكون بـ{lang}.',
        'lang.current':         '🌍 اللغة الحالية: *{lang}*',
        'lang.unknown':         '❌ لغة غير معروفة: *{lang}*\nالمتاحة: {available}',
        'lang.noChange':        '⚠️ اللغة مضبوطة بالفعل على *{lang}*.',

        'welcome.default':      '👋 مرحباً @user في @group!',
        'goodbye.default':      '👋 وداعاً @user! سنفتقدك.',

        'warn.issued':          '⚠️ *تحذير {count}/{max}* صدر لـ @user.',
        'warn.maxReached':      '🚨 @user وصل إلى {max} تحذيرات وتمت إزالته.',
        'warn.reset':           '✅ تم إعادة تعيين تحذيرات @user.',

        'error.timeout':        '⏰ انتهت المهلة. حاول مرة أخرى.',
        'error.noResult':       '😔 لم يتم العثور على نتائج لـ: *{query}*',
        'error.fileTooSmall':   '❌ الملف المحمّل فارغ. حاول مرة أخرى.',
    },

    // ─── German ──────────────────────────────────────────────────────────────
    german: {
        'general.wait':         '⏳ Bitte warten...',
        'general.success':      '✅ Fertig!',
        'general.error':        '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
        'general.adminOnly':    '🛡️ Dieser Befehl ist nur für Admins!',
        'general.groupOnly':    '👥 Dieser Befehl kann nur in Gruppen verwendet werden!',
        'general.ownerOnly':    '🔒 Dieser Befehl ist dem Bot-Besitzer vorbehalten.',
        'general.botAdminNeeded': '🤖 Ich muss Admin sein, um das zu tun!',
        'general.invalidArgs':  '❌ Ungültige Argumente. Überprüfe die Verwendung und versuche es erneut.',

        'ping.checking':        '⏳ *Status wird überprüft...*',
        'ping.fast':            'Schnell',
        'ping.good':            'Gut',
        'ping.okay':            'Okay',
        'ping.slow':            'Langsam',

        'alive.status':         'Online & Aktiv',
        'alive.uptime':         'Laufzeit',
        'alive.date':           'Datum',
        'alive.time':           'Uhrzeit',
        'alive.prefix':         'Präfix',
        'alive.version':        'Version',
        'alive.owner':          'Besitzer',
        'alive.powered':        'Angetrieben vom König der Flüche',

        'menu.domainIntro':     '🔮 *Domänenexpansion........*\n\n_Bösartiger Schrein — Grenzenlose Leere_\n\n> 👹 Der König der Flüche öffnet das Menü...',
        'menu.prefix':          '⚡  *Präfix* › `{prefix}`',
        'menu.version':         '📦  *Version* › {version}',
        'menu.creator':         '👑  *Ersteller* › {creator}',
        'menu.totalCommands':   '📊  *Befehle gesamt:* {count}',
        'menu.powered':         '> 🔥 _{botName} — Angetrieben vom König der Flüche_',
        'menu.commands':        'BEFEHLE',
        'menu.buttonFooter':    'Tippe auf einen Button für eine schnelle Aktion!',

        'cat.owner':            'BESITZER',
        'cat.admin':            'ADMIN',
        'cat.moderation':       'MODERATION',
        'cat.fun':              'SPASS',
        'cat.media':            'MEDIEN',
        'cat.ai':               'KI',
        'cat.utility':          'WERKZEUGE',
        'cat.group':            'GRUPPE',
        'cat.general':          'ALLGEMEIN',

        'play.searching':       '🔍 Suche: *{query}*...',
        'play.downloading':     '⬇️ Download: *{title}*...',
        'play.success':         '✅ *{title}*\n🎵 Genieße die Musik!',
        'play.notFound':        '❌ *{query}* konnte nicht gefunden werden\n\n💡 Tipps:\n• Füge den Künstlernamen hinzu: `.play Essence Wizkid`\n• Versuche den vollständigen Titel\n• Verwende einen YouTube-Link: `.play https://youtu.be/...`',
        'play.downloadFail':    '❌ Download fehlgeschlagen: {error}\n\n💡 Versuche: `.play <anderer Song>` oder einen direkten Link.',
        'play.noQuery':         '🎵 *Verwendung:* .play <Songname>\n*Beispiel:* .play Essence Wizkid\n\nUnterstützt Songnamen, YouTube & Spotify Links.',
        'play.thumbCaption':    '🎵 *{title}*\n👤 *Künstler:* {artist}\n⏱️ *Dauer:* {duration}\n\n⬇️ Audio wird heruntergeladen...',
        'play.fileTooSmall':    '❌ Die heruntergeladene Datei ist leer. Versuche es erneut.',

        'setcmd.set':           '✅ *Sticker-Befehl gesetzt!*\nBefehl: `.{cmd}`',
        'setcmd.updated':       '✏️ *Aktualisiert!* Alt: `{old}` → Neu: `{cmd}`',
        'setcmd.noSticker':     '❌ Bitte antworte auf einen Sticker.',
        'setcmd.unknownCmd':    '❌ Unbekannter Befehl: *{cmd}*',
        'unsetcmd.removed':     '🗑️ Verknüpfung zu `.{cmd}` entfernt.',
        'unsetcmd.notFound':    '⚠️ Dieser Sticker hat keine Verknüpfung.',
        'cmdlist.empty':        '📋 Keine Sticker-Verknüpfungen in dieser Gruppe.',
        'cmdlist.header':       '📋 *Sticker-Befehl-Verknüpfungen*',
        'cmdlist.total':        'Gesamt: *{count}* Verknüpfung(en)',

        'lang.set':             '🌍 Sprache auf *{lang}* gesetzt! Alle Antworten werden auf {lang} sein.',
        'lang.current':         '🌍 Aktuelle Sprache: *{lang}*',
        'lang.unknown':         '❌ Unbekannte Sprache: *{lang}*\nVerfügbar: {available}',
        'lang.noChange':        '⚠️ Die Sprache ist bereits auf *{lang}* eingestellt.',

        'welcome.default':      '👋 Willkommen @user in @group!',
        'goodbye.default':      '👋 Auf Wiedersehen @user! Wir werden dich vermissen.',

        'warn.issued':          '⚠️ *Warnung {count}/{max}* an @user erteilt.',
        'warn.maxReached':      '🚨 @user hat {max} Warnungen erreicht und wurde entfernt.',
        'warn.reset':           '✅ Warnungen für @user zurückgesetzt.',

        'error.timeout':        '⏰ Zeitüberschreitung. Versuche es erneut.',
        'error.noResult':       '😔 Keine Ergebnisse für: *{query}*',
        'error.fileTooSmall':   '❌ Der Download ergab eine leere Datei. Versuche es erneut.',
    },
};

// ── Available language names ─────────────────────────────────────────────────
const AVAILABLE = Object.keys(DICTIONARY);

// ── Normalise a user-supplied language string ────────────────────────────────
function normalise(lang) {
    if (!lang) return 'english';
    return lang.toLowerCase().trim();
}

/**
 * Return a translator function for the given language.
 * Falls back to English for unknown languages or missing keys.
 *
 * @param  {string} lang
 * @returns {(key: string, vars?: Record<string,string>) => string}
 */
function getTranslator(lang) {
    const l   = normalise(lang);
    const dic = DICTIONARY[l] || DICTIONARY.english;
    const eng = DICTIONARY.english;

    return function translate(key, vars = {}) {
        let text = dic[key] ?? eng[key] ?? key; // key itself as last resort
        for (const [k, v] of Object.entries(vars)) {
            text = text.replaceAll('{' + k + '}', String(v));
        }
        return text;
    };
}

/**
 * Validate a language name.
 * @param  {string} lang
 * @returns {boolean}
 */
function isValid(lang) {
    return AVAILABLE.includes(normalise(lang));
}

/**
 * Return a human-readable comma-separated list of available languages.
 * @returns {string}
 */
function availableList() {
    return AVAILABLE.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ');
}

// ── Global outbound reply localization ───────────────────────────────────────
// Some commands already use dictionary keys, while older commands send
// hard-coded English directly. This small bridge covers those direct sends
// without making a translation service a hard dependency: failures always
// fall back to the original text.
const LANGUAGE_TARGETS = {
    english: 'en',
    french: 'fr',
    spanish: 'es',
    portuguese: 'pt',
    japanese: 'ja',
    chinese: 'zh-CN',
    arabic: 'ar',
    german: 'de',
};
const translationCache = new Map();
const TRANSLATION_CACHE_LIMIT = 400;
const TRANSLATION_TIMEOUT_MS = 3500;
const NON_TRANSLATABLE_KEYS = new Set([
    'url', 'thumbnail', 'jpegthumbnail', 'file', 'mimetype', 'fileName',
    'filename', 'mentions', 'contextInfo', 'messageContextInfo', 'quoted',
    'quotedMessage', 'media', 'sticker', 'audio', 'video', 'image', 'document',
]);
const TRANSLATABLE_KEYS = new Set([
    'text', 'caption', 'title', 'description', 'footer', 'displayText',
    'display_text', 'contentText', 'bodyText', 'headerText', 'buttonText',
]);

const UI_LABELS = {
    english: {
        statusHeader: 'SYSTEM · LIVE STATUS', online: 'Online · all cursed engines running',
        uptime: 'BOT UPTIME', systemUptime: 'SYSTEM UPTIME', botMemory: 'BOT MEMORY',
        platform: 'PLATFORM', totalRam: 'TOTAL RAM', freeRam: 'FREE RAM',
        ping: 'PING', prefix: 'PREFIX', version: 'VERSION', runtime: 'RUNTIME',
        operator: 'OPERATOR', memory: 'MEMORY', timestamp: 'TIMESTAMP',
    },
    french: {
        statusHeader: 'SYSTÈME · STATUT EN DIRECT', online: 'En ligne · tous les moteurs actifs',
        uptime: 'TEMPS BOT', systemUptime: 'TEMPS SYSTÈME', botMemory: 'MÉMOIRE BOT',
        platform: 'PLATEFORME', totalRam: 'RAM TOTALE', freeRam: 'RAM LIBRE',
        ping: 'PING', prefix: 'PRÉFIXE', version: 'VERSION', runtime: 'EXÉCUTION',
        operator: 'OPÉRATEUR', memory: 'MÉMOIRE', timestamp: 'HORODATAGE',
    },
    spanish: {
        statusHeader: 'SISTEMA · ESTADO EN VIVO', online: 'En línea · todos los motores activos',
        uptime: 'TIEMPO DEL BOT', systemUptime: 'TIEMPO DEL SISTEMA', botMemory: 'MEMORIA DEL BOT',
        platform: 'PLATAFORMA', totalRam: 'RAM TOTAL', freeRam: 'RAM LIBRE',
        ping: 'PING', prefix: 'PREFIJO', version: 'VERSIÓN', runtime: 'EJECUCIÓN',
        operator: 'OPERADOR', memory: 'MEMORIA', timestamp: 'MARCA DE TIEMPO',
    },
    portuguese: {
        statusHeader: 'SISTEMA · STATUS AO VIVO', online: 'Online · todos os motores ativos',
        uptime: 'TEMPO DO BOT', systemUptime: 'TEMPO DO SISTEMA', botMemory: 'MEMÓRIA DO BOT',
        platform: 'PLATAFORMA', totalRam: 'RAM TOTAL', freeRam: 'RAM LIVRE',
        ping: 'PING', prefix: 'PREFIXO', version: 'VERSÃO', runtime: 'EXECUÇÃO',
        operator: 'OPERADOR', memory: 'MEMÓRIA', timestamp: 'MARCAÇÃO DE TEMPO',
    },
    japanese: {
        statusHeader: 'システム · ライブステータス', online: 'オンライン · すべてのエンジン稼働中',
        uptime: 'ボット稼働時間', systemUptime: 'システム稼働時間', botMemory: 'ボットメモリ',
        platform: 'プラットフォーム', totalRam: '総RAM', freeRam: '空きRAM',
        ping: 'PING', prefix: 'プレフィックス', version: 'バージョン', runtime: '実行環境',
        operator: 'オペレーター', memory: 'メモリ', timestamp: 'タイムスタンプ',
    },
    chinese: {
        statusHeader: '系统 · 实时状态', online: '在线 · 所有引擎运行中',
        uptime: '机器人运行时间', systemUptime: '系统运行时间', botMemory: '机器人内存',
        platform: '平台', totalRam: '总内存', freeRam: '可用内存',
        ping: '延迟', prefix: '前缀', version: '版本', runtime: '运行环境',
        operator: '操作员', memory: '内存', timestamp: '时间戳',
    },
    arabic: {
        statusHeader: 'النظام · الحالة المباشرة', online: 'متصل · جميع المحركات تعمل',
        uptime: 'مدة تشغيل البوت', systemUptime: 'مدة تشغيل النظام', botMemory: 'ذاكرة البوت',
        platform: 'المنصة', totalRam: 'إجمالي الذاكرة', freeRam: 'الذاكرة الحرة',
        ping: 'الاستجابة', prefix: 'البادئة', version: 'الإصدار', runtime: 'بيئة التشغيل',
        operator: 'المشغّل', memory: 'الذاكرة', timestamp: 'الطابع الزمني',
    },
    german: {
        statusHeader: 'SYSTEM · LIVE-STATUS', online: 'Online · alle Engines laufen',
        uptime: 'BOT-LAUFZEIT', systemUptime: 'SYSTEM-LAUFZEIT', botMemory: 'BOT-SPEICHER',
        platform: 'PLATTFORM', totalRam: 'GESAMT-RAM', freeRam: 'FREIER RAM',
        ping: 'PING', prefix: 'PRÄFIX', version: 'VERSION', runtime: 'LAUFZEIT',
        operator: 'BETREIBER', memory: 'SPEICHER', timestamp: 'ZEITSTEMPEL',
    },
};

function getUiLabels(lang) {
    return { ...(UI_LABELS[normalise(lang)] || UI_LABELS.english) };
}

function _cacheSet(key, value) {
    if (translationCache.size >= TRANSLATION_CACHE_LIMIT) {
        translationCache.delete(translationCache.keys().next().value);
    }
    translationCache.set(key, value);
}

function _protectTranslationTokens(text) {
    const protectedParts = [];
    const tokenRe = /https?:\/\/[^\s<>]+|www\.[^\s<>]+|`[^`]*`|\.([a-z][a-z0-9_-]*)|@[0-9][0-9:._-]*(?:@[a-z.]+)?/gi;
    const protectedText = String(text).replace(tokenRe, token => {
        const marker = `ZXQ_SUKUNA_TOKEN_${protectedParts.length}_QXZ`;
        protectedParts.push([marker, token]);
        return marker;
    });
    return { protectedText, protectedParts };
}

function _restoreTranslationTokens(text, protectedParts) {
    let output = String(text);
    for (const [marker, value] of protectedParts) output = output.replaceAll(marker, value);
    return output;
}

async function _translateChunk(protectedText, target) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
    try {
        // MyMemory supports the free EN→locale route without a key. Keep the
        // source fixed to English because bot command output is authored in
        // English; unsupported/limited responses fall back to the source text.
        const langPair = `en|${target}`;
        const url = 'https://api.mymemory.translated.net/get' +
            `?q=${encodeURIComponent(protectedText)}&langpair=${encodeURIComponent(langPair)}`;
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'SUKUNA-MD/3.0' },
        });
        if (!response.ok) throw new Error(`translation HTTP ${response.status}`);
        const data = await response.json();
        const translated = String(data?.responseData?.translatedText || '').trim();
        if (data?.responseStatus !== 200 || !translated ||
            /invalid source language|quota|rate limit|mymemory/i.test(translated)) {
            return protectedText;
        }
        return translated;
    } catch (_) {
        return protectedText;
    } finally {
        clearTimeout(timeout);
    }
}

async function translateText(text, lang) {
    const original = String(text ?? '');
    const target = LANGUAGE_TARGETS[normalise(lang)] || 'en';
    if (!original.trim() || target === 'en' || original.length > 16000) return original;
    const cacheKey = `${target}\\n${original}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

    const { protectedText, protectedParts } = _protectTranslationTokens(original);
    const chunks = [];
    let current = '';
    for (const line of protectedText.split('\\n')) {
        const candidate = current ? `${current}\\n${line}` : line;
        if (current && candidate.length > 450) {
            chunks.push(current);
            current = line;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);

    const translatedChunks = [];
    for (const chunk of chunks) {
        translatedChunks.push(await _translateChunk(chunk, target));
    }
    const translated = translatedChunks.join('\\n');
    const result = translated ? _restoreTranslationTokens(translated, protectedParts) : original;
    _cacheSet(cacheKey, result);
    return result;
}

async function localiseOutboundContent(content, lang) {
    if (!content || typeof content !== 'object') return content;
    const locale = normalise(lang);
    if (locale === 'english') return content;
    const clone = Array.isArray(content) ? [...content] : { ...content };
    const jobs = [];

    for (const [key, value] of Object.entries(clone)) {
        const lowerKey = String(key).toLowerCase();
        if (NON_TRANSLATABLE_KEYS.has(lowerKey)) continue;
        if (typeof value === 'string' && TRANSLATABLE_KEYS.has(key)) {
            jobs.push(translateText(value, locale).then(translated => { clone[key] = translated; }));
            continue;
        }
        if (key === 'buttonParamsJson' && typeof value === 'string') {
            jobs.push((async () => {
                try {
                    const params = JSON.parse(value);
                    if (typeof params.display_text === 'string') {
                        params.display_text = await translateText(params.display_text, locale);
                    }
                    clone[key] = JSON.stringify(params);
                } catch (_) {}
            })());
            continue;
        }
        if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
            jobs.push(localiseOutboundContent(value, locale).then(localised => { clone[key] = localised; }));
        }
    }
    await Promise.all(jobs);
    return clone;
}

module.exports = {
    getTranslator,
    isValid,
    normalise,
    availableList,
    AVAILABLE,
    translateText,
    localiseOutboundContent,
    getUiLabels,
};

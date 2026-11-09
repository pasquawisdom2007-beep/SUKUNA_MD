'use strict';

const crypto = require('crypto');
const { generateWAMessageFromContent, generateWAMessageContent, proto } = require('@pasqua-dev/baileys');
const sharp = require('sharp');
const database = require('./database');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
}

function richContext(quoted) {
    if (!quoted?.key) return {
        forwardingScore: 1,
        isForwarded: true,
        forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
        forwardOrigin: 4,
    };
    return {
        forwardingScore: 1,
        isForwarded: true,
        forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
        forwardOrigin: 4,
        stanzaId: quoted.key.id,
        participant: quoted.key.participant || quoted.participant || quoted.key.remoteJid,
        ...(quoted.message ? { quotedMessage: quoted.message } : {}),
    };
}

function buildRichContent(html, quoted, { title = '', url = '', trustedSources = [] } = {}) {
    const data = Buffer.from(JSON.stringify({
        __typename: 'GenAIUnifiedResponse',
        response_id: crypto.randomUUID(),
        ...(title ? { title: String(title) } : {}),
        sections: [{
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
                    ...(title ? { title: String(title) } : {}),
                    trusted_sources: Array.isArray(trustedSources) ? trustedSources : [],
                    ...(url ? { url: String(url) } : {}),
                    payload: String(html),
                },
            },
        }],
    })).toString('base64');

    return proto.Message.fromObject({
        messageContextInfo: {
            threadId: [],
            deviceListMetadata: {
                senderKeyIndexes: [],
                recipientKeyIndexes: [],
                recipientKeyHash: '',
                recipientTimestamp: Math.floor(Date.now() / 1000),
            },
            deviceListMetadataVersion: 2,
            messageSecret: crypto.randomBytes(32),
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [],
                    unifiedResponse: { data },
                    contextInfo: richContext(quoted),
                },
            },
        },
    });
}

function textHtml(text, title = 'SUKUNA MD') {
    const safeTitle = escapeHtml(title);
    const safeText = escapeHtml(text);
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:radial-gradient(circle at 50% 5%,#174936,#061812 72%)}.card{padding:14px;border:2px solid #b9954d;border-radius:16px;background:linear-gradient(145deg,#0a2e22,#123e2f 55%,#061812);color:#e3dfbb;box-shadow:inset 0 0 0 3px #163f31,0 7px 18px #000b}.title{text-align:center;color:#f1e3a2;font:bold 17px Arial Black,sans-serif;letter-spacing:.7px}.rule{height:2px;margin:9px 0;background:linear-gradient(90deg,transparent,#b9954d,transparent)}.body{white-space:pre-wrap;overflow-wrap:anywhere;color:#e8f4e5;font:13px/1.45 monospace}.footer{margin-top:11px;text-align:center;color:#8fbea0;font:10px monospace}</style></head><body><div class="card"><div class="title">${safeTitle}</div><div class="rule"></div><div class="body">${safeText}</div><div class="footer">SUKUNA MD · GENAI RICH RESPONSE</div></div></body></html>`;
}

function htmlToPlainText(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>|<\/p>|<\/section>|<\/h[1-6]>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function escapeXml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    }[char]));
}

async function sendCanvasFallback({ sock, jid, quoted, html, canvasText, title, caption, theme = 'default', mentions = [] }) {
    const text = canvasText || htmlToPlainText(html) || 'SUKUNA MD';
    const lines = [];
    for (const paragraph of text.split(/\n+/)) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
            if ((line + ' ' + word).trim().length > 72) {
                if (line) lines.push(line);
                line = word;
            } else line = (line + ' ' + word).trim();
        }
        if (line) lines.push(line);
    }
    const lineHeight = 58;
    const height = Math.max(500, 190 + lines.length * lineHeight);
    const textSvg = lines.map((line, index) =>
        `<text x="96" y="${190 + index * lineHeight}" class="body">${escapeXml(line)}</text>`
    ).join('');
    const sukuna = theme === 'sukuna';
    const bgStart = sukuna ? '#050204' : '#250b35';
    const bgMid = sukuna ? '#580914' : '#43123f';
    const bgEnd = sukuna ? '#1a0308' : '#12091d';
    const accent = sukuna ? '#ff3158' : '#ee4fa3';
    const titleText = title || (sukuna ? '☠ SUKUNA BAN CHECKER ☠' : 'SUKUNA MD · IPHONE MODE');
    const footerText = sukuna ? 'BARON API · CURSED VERIFICATION' : 'COLOURED CANVAS FALLBACK';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${height}">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bgStart}"/><stop offset=".52" stop-color="${bgMid}"/><stop offset="1" stop-color="${bgEnd}"/></linearGradient></defs>
      <rect width="100%" height="100%" rx="34" fill="url(#bg)"/>
      <rect x="30" y="30" width="1540" height="${height - 60}" rx="42" fill="none" stroke="${accent}" stroke-width="6"/>
      <circle cx="126" cy="98" r="30" fill="${accent}"/><circle cx="1474" cy="98" r="30" fill="#8d1835"/>
      <text x="800" y="114" text-anchor="middle" class="title">${escapeXml(titleText)}</text>
      <path d="M96 148H1504" stroke="${accent}" stroke-width="4"/>
      ${textSvg}
      <text x="800" y="${height - 48}" text-anchor="middle" class="footer">${footerText}</text>
      <style>.title{font:700 48px Arial,sans-serif;fill:#fff0f7;letter-spacing:4px}.body{font:700 38px monospace;fill:#fff5fa}.footer{font:600 23px monospace;fill:#f0a8c5;letter-spacing:4px}</style>
    </svg>`;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    return sock.sendMessage(jid, { image, caption: caption || 'SUKUNA MD · iPhone mode', ...(mentions.length ? { mentions } : {}) }, { quoted });
}

async function sendSukunaTTTCanvas({ sock, jid, quoted, board, players = [], status = '', mentions = [] }) {
    const cells = Array.isArray(board) ? board : Array(9).fill('');
    const cellSize = 220;
    const boardX = 150;
    const boardY = 205;
    const boardSize = cellSize * 3;
    const marks = cells.map((mark, index) => {
        if (!mark) return '';
        const x = boardX + (index % 3) * cellSize + cellSize / 2;
        const y = boardY + Math.floor(index / 3) * cellSize + 155;
        const color = mark === 'X' ? '#ff4778' : '#ffb0c5';
        return `<text x="${x}" y="${y}" text-anchor="middle" class="mark" fill="${color}">${mark}</text>`;
    }).join('');
    const playerLine = players.length >= 2
        ? `X  @${labelForCanvas(players[0])}        O  @${labelForCanvas(players[1])}`
        : 'WAITING FOR TWO PLAYERS · SEND .JOIN';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1100">
      <defs><linearGradient id="arena" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050204"/><stop offset=".5" stop-color="#5c0916"/><stop offset="1" stop-color="#180309"/></linearGradient></defs>
      <rect width="1200" height="1100" rx="40" fill="url(#arena)"/>
      <rect x="24" y="24" width="1152" height="1052" rx="34" fill="none" stroke="#ff3158" stroke-width="6"/>
      <text x="600" y="92" text-anchor="middle" class="title">☠ SUKUNA TTT ☠</text>
      <text x="600" y="145" text-anchor="middle" class="players">${escapeXml(playerLine)}</text>
      <path d="M90 172H1110" stroke="#ff3158" stroke-width="3"/>
      <rect x="${boardX - 14}" y="${boardY - 14}" width="${boardSize + 28}" height="${boardSize + 28}" rx="22" fill="#100207" stroke="#ff3158" stroke-width="5"/>
      <path d="M${boardX + cellSize} ${boardY}V${boardY + boardSize} M${boardX + cellSize * 2} ${boardY}V${boardY + boardSize} M${boardX} ${boardY + cellSize}H${boardX + boardSize} M${boardX} ${boardY + cellSize * 2}H${boardX + boardSize}" stroke="#ff6686" stroke-width="10" stroke-linecap="round"/>
      ${marks}
      <text x="600" y="${boardY + boardSize + 95}" text-anchor="middle" class="status">${escapeXml(status || 'SEND .TTT 1–9 TO PLAY')}</text>
      <text x="600" y="${boardY + boardSize + 145}" text-anchor="middle" class="hint">SUKUNA DOMAIN · CHOOSE A SQUARE</text>
      <style>.title{font:900 48px Arial,sans-serif;fill:#fff2f6;letter-spacing:6px}.players{font:700 23px monospace;fill:#ffc6d4;letter-spacing:1px}.mark{font:900 150px Arial,sans-serif;paint-order:stroke;stroke:#25030b;stroke-width:6}.status{font:800 29px monospace;fill:#fff0f4}.hint{font:600 17px monospace;fill:#f094ab;letter-spacing:3px}</style>
    </svg>`;
    const image = await sharp(Buffer.from(svg)).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer();
    return sock.sendMessage(jid, { image, caption: status || 'SUKUNA TTT', ...(mentions.length ? { mentions } : {}) }, { quoted });
}

async function sendSukunaBanCanvas({ sock, jid, quoted, number, banned, details = {}, reviewAvailable = false }) {
    const blue = '#36b9ff';
    const cyan = '#70eaff';
    const green = '#48f0aa';
    const red = '#ff637f';
    const amber = '#ffd166';
    const kind = String(details.banKind || 'UNKNOWN').toUpperCase();
    const status = banned ? 'ACCOUNT RESTRICTED' : 'ACCOUNT CLEAR';
    const statusColor = banned ? red : green;
    const banTime = details.banTime ? String(details.banTime) : 'Not provided by API';
    const banAge = details.banAge ? String(details.banAge) : 'Unavailable';
    const reviewTime = details.reviewTime ? String(details.reviewTime) : 'No appeal submission recorded';
    const appealStatus = details.appealStatus ? String(details.appealStatus).toUpperCase() : (reviewAvailable ? 'AVAILABLE' : 'NOT AVAILABLE');
    const reason = details.reason ? String(details.reason) : 'No violation details provided';
    const category = details.category ? String(details.category).toUpperCase() : 'NOT PROVIDED';
    const typeText = details.banType ? String(details.banType).replace(/[_-]+/g, ' ').toUpperCase() : 'NOT PROVIDED';
    const euText = details.isEu === true ? 'YES' : details.isEu === false ? 'NO' : 'NOT PROVIDED';
    const xml = value => escapeXml(value).replace(/[\r\n]+/g, ' ').slice(0, 160);
    const wrappedReason = (() => { const words = reason.split(/\s+/); const lines = []; let line = ''; for (const word of words) { if ((line + ' ' + word).trim().length > 96) { if (line) lines.push(line); line = word; } else line = (line + ' ' + word).trim(); } if (line) lines.push(line); return lines.slice(0, 2); })();
    const reasonMarkup = wrappedReason.map((line, index) => `<text x="120" y="${1003 + index * 30}" class="panel-value">${xml(line)}</text>`).join('');
    const title = banned ? 'BAN DETECTED' : 'NO BAN DETECTED';
    const panel = (x,y,w,h,titleText,bodyLines,accent=blue) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#0b1423" stroke="${accent}" stroke-opacity=".42" stroke-width="2"/><text x="${x+24}" y="${y+34}" class="panel-title">${xml(titleText)}</text>${bodyLines.map((line,i)=>`<text x="${x+24}" y="${y+67+i*28}" class="panel-value">${xml(line)}</text>`).join('')}`;
    const reviewCard = reviewAvailable
      ? `<rect x="92" y="1122" width="1416" height="82" rx="18" fill="#0d2332" stroke="${cyan}" stroke-opacity=".48" stroke-width="2"/><circle cx="138" cy="1163" r="16" fill="${cyan}" fill-opacity=".18" stroke="${cyan}" stroke-width="2"/><path d="M131 1163l5 5 10-12" fill="none" stroke="${cyan}" stroke-width="3"/><text x="174" y="1159" class="review-title">IN-APP REVIEW ${reviewAvailable ? 'AVAILABLE' : ''}</text><text x="174" y="1185" class="review-copy">Submit from the banned number in WhatsApp. The checker cannot submit an appeal on your behalf.</text>`
      : `<rect x="92" y="1122" width="1416" height="82" rx="18" fill="#111b29" stroke="#52718d" stroke-opacity=".38" stroke-width="2"/><text x="120" y="1160" class="review-title">REVIEW ACTION NOT AVAILABLE</text><text x="120" y="1185" class="review-copy">If WhatsApp shows Request a review in the banned account, submit it in that app.</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1260" viewBox="0 0 1600 1260">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050a16"/><stop offset=".5" stop-color="#07172c"/><stop offset="1" stop-color="#050d1d"/></linearGradient><radialGradient id="halo"><stop stop-color="#14629a" stop-opacity=".38"/><stop offset="1" stop-color="#061020" stop-opacity="0"/></radialGradient><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#28a9ff" stroke-opacity=".07" stroke-width="1"/></pattern><filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <rect width="1600" height="1260" rx="36" fill="url(#bg)"/><rect width="1600" height="1260" rx="36" fill="url(#grid)"/><ellipse cx="800" cy="410" rx="690" ry="470" fill="url(#halo)"/><rect x="25" y="25" width="1550" height="1210" rx="32" fill="none" stroke="${blue}" stroke-opacity=".65" stroke-width="2"/>
      <text x="92" y="93" class="brand">SUKUNA MD <tspan fill="${blue}">/</tspan> ACCOUNT BIOMETRICS</text><text x="1508" y="92" text-anchor="end" class="micro">SECURE DIAGNOSTIC · BARON API</text><path d="M92 124H1508" stroke="${blue}" stroke-opacity=".45" stroke-width="2"/>
      <circle cx="800" cy="295" r="133" fill="#07101e" stroke="${statusColor}" stroke-opacity=".42" stroke-width="2"/><circle cx="800" cy="295" r="112" fill="none" stroke="${blue}" stroke-opacity=".24" stroke-width="2"/><circle cx="800" cy="295" r="91" fill="none" stroke="${blue}" stroke-opacity=".42" stroke-width="1" stroke-dasharray="4 11"/><path d="M800 156A139 139 0 0 1 937 275" fill="none" stroke="${statusColor}" stroke-width="5" stroke-linecap="round" filter="url(#glow)"/><path d="M800 172v30m0 186v30m-139-123h30m218 0h30" stroke="${blue}" stroke-opacity=".68" stroke-width="2"/><text x="800" y="281" text-anchor="middle" class="scan-label">SCAN COMPLETE</text><text x="800" y="329" text-anchor="middle" class="status" fill="${statusColor}">${title}</text><text x="800" y="385" text-anchor="middle" class="phone">+${xml(number)}</text>
      <rect x="92" y="455" width="1416" height="106" rx="18" fill="#0a1423" stroke="${statusColor}" stroke-opacity=".58" stroke-width="2"/><text x="122" y="493" class="label">BAN TYPE</text><text x="122" y="535" class="headline" fill="${banned ? statusColor : green}">${banned ? typeText : 'NONE'}</text><text x="550" y="493" class="label">DURATION TYPE</text><text x="550" y="535" class="headline" fill="${kind === 'PERMANENT' ? red : kind === 'TEMPORARY' ? amber : cyan}">${banned ? kind : 'NOT BANNED'}</text><text x="1065" y="493" class="label">REVIEW ELIGIBILITY</text><text x="1065" y="535" class="headline" fill="${reviewAvailable ? cyan : '#8297ad'}">${reviewAvailable ? 'AVAILABLE IN APP' : 'NOT AVAILABLE'}</text>
      ${panel(92,590,690,178,'BAN DETAILS',[`Type: ${typeText}`,`Category: ${category}`,`Started: ${banTime}`,`Elapsed: ${banAge}`],blue)}
      ${panel(818,590,690,178,'APPEAL STATUS',[`Status: ${appealStatus}`,`Review filed: ${reviewTime}`,`Region / EU: ${euText}`,`Mode: ${kind}`],cyan)}
      <rect x="92" y="915" width="1416" height="166" rx="22" fill="#0b1423" stroke="#2c6090" stroke-opacity=".65" stroke-width="2"/><text x="120" y="956" class="panel-title">VIOLATION / DIAGNOSTIC DETAILS</text>${reasonMarkup}<text x="120" y="1070" class="panel-small">BAN TIME SHOWN IN UTC · TEMPORARY EXPIRY IS NOT PROVIDED WHEN ABSENT FROM API</text>
      ${reviewCard}<text x="800" y="1230" text-anchor="middle" class="footer">BIOMETRIC STATUS DISPLAY · NOT AN OFFICIAL WHATSAPP DECISION</text>
      <style>.brand{font:700 26px Arial,sans-serif;fill:#d9efff;letter-spacing:4px}.micro{font:600 14px monospace;fill:#7194b7;letter-spacing:2px}.scan-label{font:700 15px monospace;fill:#83a9cc;letter-spacing:4px}.status{font:900 27px Arial,sans-serif;letter-spacing:2px}.phone{font:700 24px monospace;fill:#e5f4ff;letter-spacing:3px}.label{font:700 16px monospace;fill:#84a9cd;letter-spacing:3px}.headline{font:900 29px Arial,sans-serif;letter-spacing:1px}.panel-title{font:700 17px monospace;fill:#52c4ff;letter-spacing:3px}.panel-value{font:600 20px monospace;fill:#dcecff}.panel-small{font:600 13px monospace;fill:#6f91b2;letter-spacing:1px}.review-title{font:800 17px monospace;fill:${cyan};letter-spacing:2px}.review-copy{font:500 16px Arial,sans-serif;fill:#abc8df}.footer{font:600 13px monospace;fill:#577798;letter-spacing:2px}</style>
    </svg>`;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    const buttons = [
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: 'REQUEST REVIEW',
                id: `banreview:request:${reviewAvailable ? '1' : '0'}`,
            }),
        },
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: '♲ Dev', id: 'banreview:dev' }),
        },
    ];
    try {
        if (typeof sock.waUploadToServer !== 'function') throw new Error('Image upload is not available for rich cards');
        const media = await generateWAMessageContent({ image }, { upload: sock.waUploadToServer });
        if (!media?.imageMessage) throw new Error('Baileys did not return an image header');
        const wrapped = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: `Ban check complete for +${number}. The attached canvas contains the full diagnostic.` },
                        footer: { text: 'SUKUNA MD · ACCOUNT BIOMETRICS' },
                        header: { title: 'BAN CHECK · SCAN RESULT', hasMediaAttachment: true, imageMessage: media.imageMessage },
                        nativeFlowMessage: { buttons, messageParamsJson: '' },
                    }),
                },
            },
        }, { userJid: sock.user?.id, ...(quoted ? { quoted } : {}) });
        await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
        return wrapped;
    } catch (error) {
        console.error('[banchecker rich card]', error?.message || error);
        // Compatibility fallback for sockets without media upload support.
        await sock.sendMessage(jid, { image }, { quoted });
        const wrapped = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: 'Use the buttons below for review guidance or the developer contact. The report is in the image above.' },
                        footer: { text: 'SUKUNA MD · ACCOUNT BIOMETRICS' },
                        header: { title: 'BAN CHECK ACTIONS', hasMediaAttachment: false },
                        nativeFlowMessage: { buttons, messageParamsJson: '' },
                    }),
                },
            },
        }, { userJid: sock.user?.id, ...(quoted ? { quoted } : {}) });
        await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
        return wrapped;
    }
}

function labelForCanvas(jid) {
    return String(jid || '').split(':')[0].split('@')[0];
}

async function sendSukunaPianoCanvas({ sock, jid, quoted, rows = [], score = 0, combo = 0, level = 1, status = '', gameOver = false }) {
    const safeRows = Array.isArray(rows) ? rows.slice(-8).reverse() : [];
    const boardX = 100;
    const boardY = 230;
    const cellW = 250;
    const cellH = 82;
    const tileMarkup = safeRows.map((row, rowIndex) => {
        const y = boardY + rowIndex * cellH;
        return [0, 1, 2, 3].map(lane => {
            if (row?.lane !== lane) return '';
            const hold = row.hold;
            return `<rect x="${boardX + lane * cellW + 8}" y="${y + 8}" width="${cellW - 16}" height="${hold ? cellH * 1.65 : cellH - 16}" rx="14" fill="${hold ? '#ff3158' : '#170912'}" stroke="${hold ? '#ffb2c1' : '#ff5b79'}" stroke-width="4"/><text x="${boardX + lane * cellW + cellW / 2}" y="${y + 57}" text-anchor="middle" class="tile">${hold ? 'HOLD' : '♪'}</text>`;
        }).join('');
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1100">
      <defs><linearGradient id="piano" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050204"/><stop offset=".48" stop-color="#650b1c"/><stop offset="1" stop-color="#16040b"/></linearGradient></defs>
      <rect width="1200" height="1100" rx="40" fill="url(#piano)"/><rect x="24" y="24" width="1152" height="1052" rx="34" fill="none" stroke="#ff3158" stroke-width="6"/>
      <text x="600" y="78" text-anchor="middle" class="title">☠ SUKUNA PIANO ☠</text>
      <text x="600" y="130" text-anchor="middle" class="stats">SCORE ${score}   ·   COMBO ${combo}   ·   LV ${level}</text>
      <path d="M92 165H1108" stroke="#ff3158" stroke-width="3"/>
      <rect x="${boardX}" y="${boardY - 18}" width="${cellW * 4}" height="${cellH * 8 + 36}" rx="22" fill="#fff6fa" opacity=".94"/>
      <path d="M${boardX + cellW} ${boardY - 18}V${boardY + cellH * 8 + 18} M${boardX + cellW * 2} ${boardY - 18}V${boardY + cellH * 8 + 18} M${boardX + cellW * 3} ${boardY - 18}V${boardY + cellH * 8 + 18}" stroke="#d9c8ce" stroke-width="3"/>
      ${tileMarkup}
      <rect x="${boardX}" y="${boardY + cellH * 7 - 5}" width="${cellW * 4}" height="8" fill="#ff3158"/>
      <text x="600" y="950" text-anchor="middle" class="status">${escapeXml(status || (gameOver ? 'ROUND OVER' : 'SEND .PIANO 1–4 TO TAP'))}</text>
      <text x="600" y="1005" text-anchor="middle" class="hint">BLACK NOTES · RED HOLD NOTES · DO NOT MISS</text>
      <style>.title{font:900 45px Arial,sans-serif;fill:#fff2f6;letter-spacing:6px}.stats{font:800 24px monospace;fill:#ffc4d2;letter-spacing:2px}.tile{font:900 27px Arial,sans-serif;fill:#fff5f8}.status{font:900 30px monospace;fill:#fff2f6}.hint{font:700 17px monospace;fill:#f094ab;letter-spacing:2px}</style>
    </svg>`;
    const image = await sharp(Buffer.from(svg)).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer();
    return sock.sendMessage(jid, { image, caption: `SUKUNA PIANO · ${status || `SCORE ${score}`}`, ...(gameOver ? {} : {}) }, { quoted });
}

async function sendRichHtml({ sock, jid, quoted, html, canvasText, title, caption, theme, mentions = [], interactive = false }) {
    // Read the persisted deployment setting as a second source of truth. This
    // covers button/interactive dispatch paths that do not rebuild the normal
    // command context before calling a GenAI renderer.
    const deviceMode = sock?.__sukunaDeviceMode || database.getDeviceMode();
    if (deviceMode === 'iphone' && !interactive) {
        return sendCanvasFallback({ sock, jid, quoted, html, canvasText, title, caption, theme, mentions });
    }
    const content = buildRichContent(html, quoted);
    const safeQuoted = quoted?.message ? quoted : undefined;
    const wrapped = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted: safeQuoted });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}
async function sendRichHtmlMessage({ sock, jid, quoted, title, html, url, trustedSources = [] }) {
    const data = Buffer.from(JSON.stringify({
        sections: [{
            view_model: {
                primitive: {
                    __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
                    payload: String(html),
                    title: String(title || ''),
                    url: String(url || ''),
                    trusted_sources: Array.isArray(trustedSources) ? trustedSources : [],
                },
                __typename: 'GenAISingleLayoutViewModel',
            },
            __typename: 'GenAIUnifiedResponseSection',
        }],
    })).toString('base64');
    const content = proto.Message.fromObject({
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [],
                    unifiedResponse: { data },
                    contextInfo: richContext(quoted),
                },
            },
        },
    });
    const safeQuoted = quoted?.message ? quoted : undefined;
    const wrapped = generateWAMessageFromContent(jid, content, { userJid: sock.user?.id, quoted: safeQuoted });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

async function sendRichText({ sock, jid, quoted, text, title }) {
    return sendRichHtml({ sock, jid, quoted, html: textHtml(text, title) });
}

function createEconomyGenAISock(sock, { title = 'ECONOMY' } = {}) {
    return new Proxy(sock, {
        get(target, property) {
            if (property !== 'sendMessage') {
                const value = target[property];
                return typeof value === 'function' ? value.bind(target) : value;
            }
            return async (jid, content, options = {}) => {
                const isEditable = Boolean(content?.edit);
                const isReaction = Boolean(content?.react);
                const shouldRichRender = !isEditable && !isReaction &&
                    (Boolean(content?.image) || typeof content?.text === 'string');
                if (!shouldRichRender) return target.sendMessage.call(target, jid, content, options);
                const text = content.text || content.caption || 'Economy update';
                return sendRichText({ sock: target, jid, quoted: options.quoted, text, title });
            };
        },
    });
}

module.exports = { escapeHtml, buildRichContent, htmlToPlainText, sendCanvasFallback, sendSukunaTTTCanvas, sendSukunaBanCanvas, sendSukunaPianoCanvas, sendRichHtml, sendRichHtmlMessage, sendRichText, createEconomyGenAISock };

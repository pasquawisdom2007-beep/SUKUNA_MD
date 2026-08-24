/**
 * canvasRender.js — Sukuna-themed economy "canvas" cards
 *
 * Pure SVG → PNG via `sharp` (already a dependency). No native canvas build.
 * Each function returns a Buffer suitable for `sock.sendMessage(jid, { image: buf, caption })`.
 *
 * The look mirrors the website's WalletCanvas: dark gradient, runic borders,
 * scanlines, gold/red Sukuna palette.
 */

'use strict';

const sharp = require('sharp');

const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(n || 0)));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripEmoji = (s) => esc(String(s ?? '').replace(/[\u2300-\u23FF\u2460-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FFFF}\uFE0F\u200D]/gu, '').replace(/\s+/g,' ').trim());

const LOC_NAMES = {
    tokyo:      '🏯 Tokyo Jujutsu High',
    kyoto:      '⛩️ Kyoto Jujutsu High',
    shibuya:    '🌃 Shibuya',
    shinjuku:   '🌆 Shinjuku',
    malevolent: '⛩️ Malevolent Shrine',
};

// ── shared chrome (gradients, scanlines, runic frame) ────────────────────────
function chrome(w, h, accent = '#ef4444') {
    return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#0b0b10"/>
        <stop offset="60%"  stop-color="#1a0c0f"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.35"/>
      </linearGradient>
      <radialGradient id="glow" cx="85%" cy="15%" r="60%">
        <stop offset="0%"  stop-color="${accent}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="scan" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="2" fill="transparent"/>
        <rect y="2" width="3" height="1" fill="#ffffff" fill-opacity="0.04"/>
      </pattern>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    <rect width="${w}" height="${h}" fill="url(#scan)"/>
    <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none"
          stroke="${accent}" stroke-opacity="0.55" stroke-width="2" rx="22"/>
    <rect x="14" y="14" width="${w - 28}" height="${h - 28}" fill="none"
          stroke="#fbbf24" stroke-opacity="0.25" stroke-width="1" rx="18"/>`;
}

function footer(w, h, label = '꧁ Malevolent Kings ꧂') {
    return `
    <line x1="40" y1="${h - 42}" x2="${w - 40}" y2="${h - 42}"
          stroke="#ef4444" stroke-opacity="0.5"/>
    <text x="${w / 2}" y="${h - 22}" text-anchor="middle"
          font-family="Georgia, serif" font-size="13" letter-spacing="6"
          fill="#fbbf24" fill-opacity="0.8">${label}</text>`;
}

async function svgToPng(svg) {
    return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── WALLET / BANK CARD ───────────────────────────────────────────────────────
async function renderWalletCard({ name, wallet = 0, bank = 0, totalEarned = 0, location = 'tokyo' }) {
    const W = 900, H = 480;
    const loc = LOC_NAMES[location] || LOC_NAMES.tokyo;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H)}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.7">CURSED LEDGER · LIVE</text>
      <text x="48" y="130" font-family="Georgia, serif" font-size="44" font-weight="bold"
            fill="#fbbf24">${esc(name || 'Cursed One')}</text>

      <text x="${W - 48}" y="78" text-anchor="end" font-family="Georgia, serif"
            font-size="12" letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">REGION</text>
      <text x="${W - 48}" y="108" text-anchor="end" font-family="Georgia, serif"
            font-size="20" fill="#fef3c7">${esc(loc)}</text>

      <!-- 3 stat cards -->
      ${[
          { label: 'WALLET', value: wallet, x: 48 },
          { label: 'BANK',   value: bank,   x: 48 + 280 },
          { label: 'EARNED', value: totalEarned, x: 48 + 560 },
      ].map(s => `
        <g transform="translate(${s.x}, 190)">
          <rect width="260" height="170" rx="16" fill="#000" fill-opacity="0.45"
                stroke="#ef4444" stroke-opacity="0.35"/>
          <text x="20" y="40" font-family="Georgia, serif" font-size="13"
                letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">${s.label}</text>
          <text x="20" y="115" font-family="Georgia, serif" font-size="42"
                font-weight="bold" fill="#fbbf24">&#36; ${fmt(s.value)}</text>
        </g>`).join('')}
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── EARNINGS CARD (work / beg / daily) ───────────────────────────────────────
async function renderEarningsCard({ title, subtitle, amount, walletAfter, accent = '#22c55e' }) {
    const W = 900, H = 380;
    const sign = amount >= 0 ? '+' : '−';
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, accent)}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">${esc(title)}</text>
      <text x="48" y="140" font-family="Georgia, serif" font-size="32"
            fill="#fef3c7">${esc(subtitle)}</text>

      <g transform="translate(48, 180)">
        <rect width="${W - 96}" height="120" rx="16" fill="#000" fill-opacity="0.5"
              stroke="${accent}" stroke-opacity="0.5"/>
        <text x="32" y="50" font-family="Georgia, serif" font-size="14"
              letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">PAYOUT</text>
        <text x="32" y="100" font-family="Georgia, serif" font-size="48"
              font-weight="bold" fill="${accent}">${sign} &#36; ${fmt(Math.abs(amount))}</text>
        <text x="${W - 128}" y="50" text-anchor="end" font-family="Georgia, serif"
              font-size="14" letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">WALLET</text>
        <text x="${W - 128}" y="100" text-anchor="end" font-family="Georgia, serif"
              font-size="32" fill="#fbbf24">&#36; ${fmt(walletAfter)}</text>
      </g>
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── CRIME CARD ───────────────────────────────────────────────────────────────
async function renderCrimeCard({ name, emoji, success, payout, fine, walletAfter }) {
    const accent = success ? '#22c55e' : '#ef4444';
    const verdict = success ? 'PULLED IT OFF' : 'CAUGHT BY THE LAW';
    return renderEarningsCard({
        title:    `CRIME · ${esc(name).toUpperCase()}`,
        subtitle: `${emoji}  ${verdict}`,
        amount:   success ? payout : -fine,
        walletAfter,
        accent,
    });
}

// ── TRAVEL CARD ──────────────────────────────────────────────────────────────
async function renderTravelCard({ from, to, cost, walletAfter, description }) {
    const W = 900, H = 420;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, '#3b82f6')}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">REGION TRANSFER</text>
      <text x="48" y="135" font-family="Georgia, serif" font-size="36"
            fill="#fbbf24">${esc(LOC_NAMES[from] || from)}  ➜  ${esc(LOC_NAMES[to] || to)}</text>
      <text x="48" y="180" font-family="Georgia, serif" font-size="20"
            fill="#fef3c7" fill-opacity="0.85">${esc(description || '')}</text>

      <g transform="translate(48, 220)">
        <rect width="${W - 96}" height="120" rx="16" fill="#000" fill-opacity="0.5"
              stroke="#3b82f6" stroke-opacity="0.5"/>
        <text x="32" y="50" font-family="Georgia, serif" font-size="14"
              letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">FARE</text>
        <text x="32" y="100" font-family="Georgia, serif" font-size="42"
              font-weight="bold" fill="#3b82f6">− &#36; ${fmt(cost)}</text>
        <text x="${W - 128}" y="50" text-anchor="end" font-family="Georgia, serif"
              font-size="14" letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">WALLET</text>
        <text x="${W - 128}" y="100" text-anchor="end" font-family="Georgia, serif"
              font-size="32" fill="#fbbf24">&#36; ${fmt(walletAfter)}</text>
      </g>
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}


// ── PROFILE CARD ─────────────────────────────────────────────────────────────
function _hpAccent(hp) {
    if (hp >= 70) return '#22c55e';
    if (hp >= 35) return '#fbbf24';
    return '#ef4444';
}

function _hpBar(x, y, w, h, hp, segments = 20) {
    const accent = _hpAccent(hp);
    const gap = 4;
    const segW = (w - gap * (segments - 1)) / segments;
    const filled = Math.round((Math.max(0, Math.min(100, hp)) / 100) * segments);
    let out = '';
    for (let i = 0; i < segments; i++) {
        const sx = x + i * (segW + gap);
        const fill = i < filled ? accent : '#1f1f24';
        const op = i < filled ? '0.95' : '0.7';
        out += `<rect x="${sx}" y="${y}" width="${segW}" height="${h}" rx="3"
                fill="${fill}" fill-opacity="${op}"
                stroke="${accent}" stroke-opacity="${i < filled ? 0.6 : 0.2}"/>`;
    }
    return out;
}

async function renderProfileCard({
    name, number, rank = 'Beginner', rankColor = '#9ca3af',
    wallet = 0, bank = 0, netWorth = 0, totalEarned = 0,
    location = 'tokyo', hp = 100, petCount = 0, charCount = 0,
}) {
    const W = 960, H = 640;
    const loc = LOC_NAMES[location] || LOC_NAMES.tokyo;
    const hpAcc = _hpAccent(hp);

    const stat = (x, y, label, value, accent = '#fbbf24') => `
        <g transform="translate(${x}, ${y})">
          <rect width="270" height="150" rx="18" fill="#000" fill-opacity="0.5"
                stroke="${accent}" stroke-opacity="0.4"/>
          <text x="22" y="38" font-family="Georgia, serif" font-size="13"
                letter-spacing="5" fill="#e5e7eb" fill-opacity="0.7">${label}</text>
          <text x="22" y="105" font-family="Georgia, serif" font-size="36"
                font-weight="bold" fill="${accent}">${value}</text>
        </g>`;

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, '#fbbf24')}

      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">CURSED PROFILE · LIVE</text>
      <text x="48" y="132" font-family="Georgia, serif" font-size="46" font-weight="bold"
            fill="#fbbf24">${esc(name || 'Cursed One')}</text>
      <text x="48" y="162" font-family="Georgia, serif" font-size="18"
            fill="#e5e7eb" fill-opacity="0.7">+${esc(number || '')}</text>

      <text x="${W - 48}" y="78" text-anchor="end" font-family="Georgia, serif"
            font-size="12" letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">REGION</text>
      <text x="${W - 48}" y="106" text-anchor="end" font-family="Georgia, serif"
            font-size="20" fill="#fef3c7">${esc(loc)}</text>

      <!-- Rank ribbon -->
      <g transform="translate(${W - 260}, 130)">
        <rect width="212" height="46" rx="23" fill="${rankColor}" fill-opacity="0.18"
              stroke="${rankColor}" stroke-opacity="0.85" stroke-width="1.5"/>
        <text x="106" y="30" text-anchor="middle" font-family="Georgia, serif"
              font-size="18" font-weight="bold" letter-spacing="3"
              fill="${rankColor}">${stripEmoji(rank)}</text>
      </g>

      <line x1="48" y1="200" x2="${W - 48}" y2="200"
            stroke="#fbbf24" stroke-opacity="0.25"/>

      <!-- Row 1 -->
      ${stat(48,            220, 'WALLET',    '$ ' + fmt(wallet))}
      ${stat(48 + 290,      220, 'BANK',      '$ ' + fmt(bank))}
      ${stat(48 + 580,      220, 'NET WORTH', '$ ' + fmt(netWorth), '#ef4444')}

      <!-- Row 2 -->
      ${stat(48,            390, 'EARNED',     '$ ' + fmt(totalEarned))}
      ${stat(48 + 290,      390, 'PETS',       fmt(petCount))}
      ${stat(48 + 580,      390, 'CHARACTERS', fmt(charCount))}

      <!-- HP bar -->
      <text x="48" y="578" font-family="Georgia, serif" font-size="13"
            letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">HEALTH</text>
      <text x="${W - 48}" y="578" text-anchor="end" font-family="Georgia, serif"
            font-size="16" fill="${hpAcc}">${hp}/100</text>
      ${_hpBar(48, 588, W - 96, 16, hp, 24)}

      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── HEALTH CARD ──────────────────────────────────────────────────────────────
async function renderHealthCard({
    name, hp = 100, sickness = null, occupation = null, drugs = [],
}) {
    const W = 900, H = 540;
    const accent = _hpAccent(hp);
    const sickLabel = sickness ? `${sickness.emoji || '🤒'} ${sickness.name}` : '✅ Healthy';
    const occLabel  = occupation ? occupation.name : '— Unemployed';
    const list = Array.isArray(drugs) ? drugs : [];
    const shown = list.slice(0, 6);
    const overflow = list.length - shown.length;

    const chip = (x, y, w, label, color = '#fbbf24') => `
        <g transform="translate(${x}, ${y})">
          <rect width="${w}" height="44" rx="22" fill="#000" fill-opacity="0.5"
                stroke="${color}" stroke-opacity="0.55"/>
          <text x="${w / 2}" y="29" text-anchor="middle" font-family="Georgia, serif"
                font-size="16" fill="${color}">${stripEmoji(label)}</text>
        </g>`;

    let drugRow = '';
    if (shown.length === 0) {
        drugRow = `<text x="48" y="478" font-family="Georgia, serif" font-size="16"
                    fill="#e5e7eb" fill-opacity="0.6">_no medicine in cabinet_</text>`;
    } else {
        const cw = 180, gap = 14;
        shown.forEach((d, i) => {
            const x = 48 + (i % 4) * (cw + gap);
            const y = 458 + Math.floor(i / 4) * 56;
            drugRow += chip(x, y, cw, `${stripEmoji(d.name)} x${d.qty}`, '#22c55e');
        });
        if (overflow > 0) {
            drugRow += `<text x="${W - 48}" y="490" text-anchor="end"
                        font-family="Georgia, serif" font-size="14"
                        fill="#fbbf24" fill-opacity="0.85">+${overflow} more</text>`;
        }
    }

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, accent)}

      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">HEALTH REPORT · LIVE</text>
      <text x="48" y="132" font-family="Georgia, serif" font-size="42" font-weight="bold"
            fill="#fbbf24">${esc(name || 'Cursed One')}</text>

      <!-- HP big block -->
      <g transform="translate(48, 170)">
        <rect width="${W - 96}" height="150" rx="18" fill="#000" fill-opacity="0.5"
              stroke="${accent}" stroke-opacity="0.55"/>
        <text x="28" y="42" font-family="Georgia, serif" font-size="13"
              letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">CURRENT HP</text>
        <text x="28" y="108" font-family="Georgia, serif" font-size="60"
              font-weight="bold" fill="${accent}">${hp}<tspan font-size="28" fill-opacity="0.7"> / 100</tspan></text>
        ${_hpBar(28, 122, W - 96 - 56, 14, hp, 24)}
      </g>

      <!-- Status chips -->
      ${chip(48,  348, (W - 96 - 20) / 2, sickLabel, sickness ? '#ef4444' : '#22c55e')}
      ${chip(48 + (W - 96 - 20) / 2 + 20, 348, (W - 96 - 20) / 2, occLabel, '#fbbf24')}

      <!-- Medicine cabinet -->
      <text x="48" y="430" font-family="Georgia, serif" font-size="13"
            letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">MEDICINE CABINET</text>
      ${drugRow}

      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── ALIVE / SYSTEM-STATUS CARD (peak cyber, classy) ──────────────────────────
async function renderAliveCard({
    botName  = 'SUKUNA MD',
    tagline  = 'King of Curses · Online',
    owner    = 'PASQUA',
    version  = '2.0.0',
    prefix   = '.',
    uptime   = '0s',
    date     = '',
    time     = '',
    ramUsed  = 0,
    ramTotal = 0,
    ping     = 0,
    nodeVer  = process.version,
    platform = process.platform,
}) {
    const W = 1000, H = 620;
    const ramPct = ramTotal > 0 ? Math.min(100, Math.round((ramUsed / ramTotal) * 100)) : 0;

    const meterBar = (x, y, w, h, pct, color) => `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="#0a0a12" stroke="#1f2937" stroke-width="1"/>
      <rect x="${x+2}" y="${y+2}" width="${Math.max(0, (w-4) * pct/100)}" height="${h-4}" rx="${(h-4)/2}" fill="${color}"/>
      <rect x="${x+2}" y="${y+2}" width="${Math.max(0, (w-4) * pct/100)}" height="${(h-4)/2}" rx="${(h-4)/4}" fill="#ffffff" fill-opacity="0.10"/>`;

    const grid = `
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#22d3ee" stroke-opacity="0.06" stroke-width="1"/>
      </pattern>
      <linearGradient id="cyberbg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#05060d"/>
        <stop offset="55%"  stop-color="#0a0d1f"/>
        <stop offset="100%" stop-color="#1a0a2e"/>
      </linearGradient>
      <radialGradient id="cyanGlow" cx="12%" cy="18%" r="55%">
        <stop offset="0%"   stop-color="#22d3ee" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="magGlow" cx="92%" cy="92%" r="55%">
        <stop offset="0%"   stop-color="#a855f7" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="#22d3ee"/>
        <stop offset="50%"  stop-color="#e0f2fe"/>
        <stop offset="100%" stop-color="#a855f7"/>
      </linearGradient>
      <pattern id="scanl" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="2" fill="transparent"/>
        <rect y="2" width="3" height="1" fill="#ffffff" fill-opacity="0.035"/>
      </pattern>`;

    const statCard = (x, y, label, value, accent) => `
      <g transform="translate(${x}, ${y})">
        <rect width="210" height="92" rx="14" fill="#0b0d18" fill-opacity="0.85"
              stroke="${accent}" stroke-opacity="0.55" stroke-width="1"/>
        <rect width="210" height="3" rx="1.5" fill="${accent}"/>
        <text x="18" y="34" font-family="'Courier New', monospace" font-size="11"
              letter-spacing="3" fill="#94a3b8">${esc(label)}</text>
        <text x="18" y="72" font-family="'Courier New', monospace" font-size="26"
              font-weight="bold" fill="#e0f2fe">${esc(value)}</text>
      </g>`;

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${grid}</defs>

      <rect width="${W}" height="${H}" fill="url(#cyberbg)"/>
      <rect width="${W}" height="${H}" fill="url(#grid)"/>
      <rect width="${W}" height="${H}" fill="url(#cyanGlow)"/>
      <rect width="${W}" height="${H}" fill="url(#magGlow)"/>
      <rect width="${W}" height="${H}" fill="url(#scanl)"/>

      <rect x="10" y="10" width="${W-20}" height="${H-20}" rx="22" fill="none"
            stroke="#22d3ee" stroke-opacity="0.55" stroke-width="1.5"/>
      <rect x="18" y="18" width="${W-36}" height="${H-36}" rx="18" fill="none"
            stroke="#a855f7" stroke-opacity="0.35" stroke-width="1"/>

      ${[
        [28, 28, 1, 1],
        [W-28, 28, -1, 1],
        [28, H-28, 1, -1],
        [W-28, H-28, -1, -1],
      ].map(([cx, cy, sx, sy]) => `
        <path d="M ${cx} ${cy + 24*sy} L ${cx} ${cy} L ${cx + 24*sx} ${cy}"
              stroke="#22d3ee" stroke-width="2" fill="none" stroke-opacity="0.85"/>`).join('')}

      <text x="48" y="78" font-family="'Courier New', monospace" font-size="13"
            letter-spacing="8" fill="#67e8f9" fill-opacity="0.85">SYS://STATUS · LIVE</text>

      <g transform="translate(${W - 220}, 56)">
        <rect width="172" height="32" rx="16" fill="#022c22" stroke="#10b981" stroke-opacity="0.7"/>
        <circle cx="20" cy="16" r="6" fill="#10b981"/>
        <circle cx="20" cy="16" r="10" fill="none" stroke="#10b981" stroke-opacity="0.45"/>
        <text x="38" y="21" font-family="'Courier New', monospace" font-size="13"
              letter-spacing="3" fill="#a7f3d0">ONLINE · ALIVE</text>
      </g>

      <text x="48" y="158" font-family="Georgia, serif" font-size="64"
            font-weight="bold" fill="url(#title)">${esc(botName)}</text>
      <text x="48" y="192" font-family="Georgia, serif" font-size="18"
            font-style="italic" fill="#cbd5e1" fill-opacity="0.85">${esc(tagline)}</text>

      <line x1="48" y1="220" x2="${W-48}" y2="220"
            stroke="#22d3ee" stroke-opacity="0.35" stroke-width="1"/>

      ${statCard( 48, 248, 'UPTIME',  uptime,        '#22d3ee')}
      ${statCard(266, 248, 'PING',    `${ping} ms`,  '#a855f7')}
      ${statCard(484, 248, 'PREFIX',  prefix,        '#facc15')}
      ${statCard(702, 248, 'VERSION', `v${version}`, '#f472b6')}

      <g transform="translate(48, 374)">
        <text font-family="'Courier New', monospace" font-size="13"
              letter-spacing="4" fill="#94a3b8">RUNTIME</text>
        <text y="28" font-family="Georgia, serif" font-size="20" fill="#e0f2fe">
          ${esc(`Node ${nodeVer} · ${platform}`)}
        </text>
      </g>
      <g transform="translate(${W/2 + 20}, 374)">
        <text font-family="'Courier New', monospace" font-size="13"
              letter-spacing="4" fill="#94a3b8">OPERATOR</text>
        <text y="28" font-family="Georgia, serif" font-size="20" fill="#e0f2fe">
          ${esc(owner)}
        </text>
      </g>

      <g transform="translate(48, 438)">
        <text font-family="'Courier New', monospace" font-size="12"
              letter-spacing="4" fill="#94a3b8">MEMORY · ${ramUsed} / ${ramTotal} MB · ${ramPct}%</text>
        ${meterBar(0, 14, W - 96, 18, ramPct, '#22d3ee')}
      </g>

      <g transform="translate(48, 510)">
        <text font-family="'Courier New', monospace" font-size="12"
              letter-spacing="4" fill="#94a3b8">TIMESTAMP</text>
        <text y="28" font-family="Georgia, serif" font-size="22" fill="#fef3c7">
          ${esc(date)}  ·  ${esc(time)}
        </text>
      </g>

      <line x1="48" y1="${H-58}" x2="${W-48}" y2="${H-58}"
            stroke="#a855f7" stroke-opacity="0.45" stroke-width="1"/>
      <text x="${W/2}" y="${H-30}" text-anchor="middle"
            font-family="Georgia, serif" font-size="13" letter-spacing="8"
            fill="#67e8f9" fill-opacity="0.85">꧁ ${esc(botName)} · MALEVOLENT KERNEL ꧂</text>
    </svg>`;

    return svgToPng(svg);
}


// ── WEATHER CARD ─────────────────────────────────────────────────────────────
function _weatherAccent(code) {
    // wttr / WWO weatherCode buckets
    const c = parseInt(code, 10) || 0;
    if ([113].includes(c)) return { accent: '#fbbf24', emoji: '☀️' };          // clear/sun
    if ([116, 119, 122].includes(c)) return { accent: '#94a3b8', emoji: '☁️' }; // cloudy
    if ([143, 248, 260].includes(c)) return { accent: '#a3a3a3', emoji: '🌫️' }; // fog
    if ([176,263,266,281,284,293,296,299,302,305,308,311,314,317,320,353,356,359,362,365,368].includes(c))
        return { accent: '#3b82f6', emoji: '🌧️' };                              // rain
    if ([179,182,185,227,230,323,326,329,332,335,338,350,371,374,377,392,395].includes(c))
        return { accent: '#22d3ee', emoji: '❄️' };                              // snow/sleet
    if ([200,386,389].includes(c)) return { accent: '#a855f7', emoji: '⛈️' };  // storm
    return { accent: '#fbbf24', emoji: '🌤️' };
}

async function renderWeatherCard({
    city, region = '', country = '', tempC = 0, feelsC = 0, condition = '',
    humidity = 0, windKph = 0, uv = 0, weatherCode = 0, localTime = '',
}) {
    const W = 980, H = 560;
    const { accent, emoji } = _weatherAccent(weatherCode);
    const place = [region, country].filter(Boolean).join(', ');

    const stat = (x, y, label, value) => `
        <g transform="translate(${x}, ${y})">
          <rect width="270" height="150" rx="18" fill="#000" fill-opacity="0.5"
                stroke="${accent}" stroke-opacity="0.4"/>
          <text x="22" y="38" font-family="Georgia, serif" font-size="13"
                letter-spacing="5" fill="#e5e7eb" fill-opacity="0.7">${label}</text>
          <text x="22" y="105" font-family="Georgia, serif" font-size="36"
                font-weight="bold" fill="${accent}">${esc(value)}</text>
        </g>`;

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, accent)}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">WEATHER · LIVE</text>
      <text x="48" y="132" font-family="Georgia, serif" font-size="46" font-weight="bold"
            fill="#fbbf24">${esc(city)}</text>
      <text x="48" y="162" font-family="Georgia, serif" font-size="18"
            fill="#e5e7eb" fill-opacity="0.7">${esc(place)}</text>

      <text x="${W - 48}" y="78" text-anchor="end" font-family="Georgia, serif"
            font-size="12" letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">LOCAL TIME</text>
      <text x="${W - 48}" y="106" text-anchor="end" font-family="Georgia, serif"
            font-size="20" fill="#fef3c7">${esc(localTime || '—')}</text>

      <!-- big temp + condition -->
      <g transform="translate(48, 200)">
        <rect width="${W - 96}" height="160" rx="18" fill="#000" fill-opacity="0.5"
              stroke="${accent}" stroke-opacity="0.55"/>
        <text x="32" y="48" font-family="Georgia, serif" font-size="13"
              letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">TEMPERATURE</text>
        <text x="32" y="120" font-family="Georgia, serif" font-size="68"
              font-weight="bold" fill="${accent}">${tempC}°<tspan font-size="32" fill-opacity="0.7">C</tspan></text>
        <text x="32" y="148" font-family="Georgia, serif" font-size="16"
              fill="#e5e7eb" fill-opacity="0.7">feels like ${feelsC}°C</text>

        <text x="${W - 128}" y="60" text-anchor="end" font-family="Georgia, serif"
              font-size="56">${emoji}</text>
        <text x="${W - 128}" y="120" text-anchor="end" font-family="Georgia, serif"
              font-size="22" fill="#fef3c7">${esc(condition)}</text>
      </g>

      ${stat(48,        390, 'HUMIDITY', humidity + '%')}
      ${stat(48 + 290,  390, 'WIND',     windKph + ' km/h')}
      ${stat(48 + 580,  390, 'UV INDEX', String(uv))}

      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── WCG (Word Chain Game) cards ──────────────────────────────────────────────
function _playerLines(players, currentJid) {
    if (!players.length) return '<text x="32" y="40" font-family="Georgia, serif" font-size="18" fill="#e5e7eb" fill-opacity="0.6">_no players yet_</text>';
    return players.slice(0, 8).map((p, i) => {
        const num = (p.jid || '').split('@')[0];
        const isCur = p.jid === currentJid;
        const color = p.eliminated ? '#6b7280' : (isCur ? '#fbbf24' : '#e5e7eb');
        const tag = p.eliminated ? '  ✖' : (isCur ? '  ◀ TURN' : '');
        return `<text x="32" y="${40 + i * 30}" font-family="Georgia, serif"
                font-size="18" fill="${color}">@${esc(num)}${tag}</text>`;
    }).join('');
}

async function renderWcgLobbyCard({ players = [], secondsLeft = 30 }) {
    const W = 900, H = 540;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, '#a855f7')}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">WORD CHAIN · LOBBY OPEN</text>
      <text x="48" y="138" font-family="Georgia, serif" font-size="44" font-weight="bold"
            fill="#fbbf24">JOIN THE CHAIN</text>
      <text x="48" y="172" font-family="Georgia, serif" font-size="18"
            fill="#e5e7eb" fill-opacity="0.75">Type .join  ·  or reply to me with "join"</text>

      <g transform="translate(48, 210)">
        <rect width="${W - 96}" height="240" rx="18" fill="#000" fill-opacity="0.5"
              stroke="#a855f7" stroke-opacity="0.55"/>
        <text x="32" y="34" font-family="Georgia, serif" font-size="13"
              letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">PLAYERS (${players.length})</text>
        <g transform="translate(0, 30)">${_playerLines(players)}</g>
      </g>

      <text x="48" y="492" font-family="Georgia, serif" font-size="14"
            letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">STARTS IN</text>
      <text x="${W - 48}" y="492" text-anchor="end" font-family="Georgia, serif"
            font-size="28" font-weight="bold" fill="#a855f7">${secondsLeft}s</text>
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

async function renderWcgTurnCard({
    currentPlayer, requiredLetter, chainLen = 0, lastWord = '', secondsLeft = 30, players = [],
}) {
    const W = 980, H = 600;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, '#fbbf24')}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">WORD CHAIN · TURN ${chainLen + 1}</text>
      <text x="48" y="142" font-family="Georgia, serif" font-size="40" font-weight="bold"
            fill="#fbbf24">@${esc((currentPlayer || '').split('@')[0])}</text>
      <text x="48" y="172" font-family="Georgia, serif" font-size="18"
            fill="#e5e7eb" fill-opacity="0.7">your move — type .wcg &lt;word&gt;</text>

      <g transform="translate(48, 210)">
        <rect width="${W - 96}" height="180" rx="18" fill="#000" fill-opacity="0.55"
              stroke="#fbbf24" stroke-opacity="0.55"/>
        <text x="32" y="44" font-family="Georgia, serif" font-size="13"
              letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">NEXT WORD STARTS WITH</text>
        <text x="32" y="140" font-family="Georgia, serif" font-size="120"
              font-weight="bold" fill="#fbbf24">${esc(String(requiredLetter || '?').toUpperCase())}</text>
        <text x="${W - 128}" y="44" text-anchor="end" font-family="Georgia, serif"
              font-size="13" letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">PREVIOUS</text>
        <text x="${W - 128}" y="100" text-anchor="end" font-family="Georgia, serif"
              font-size="36" fill="#fef3c7">${esc(lastWord || '—')}</text>
        <text x="${W - 128}" y="140" text-anchor="end" font-family="Georgia, serif"
              font-size="14" fill="#e5e7eb" fill-opacity="0.7">chain length ${chainLen}</text>
      </g>

      <g transform="translate(48, 416)">
        <rect width="${W - 96}" height="100" rx="18" fill="#000" fill-opacity="0.5"
              stroke="#ef4444" stroke-opacity="0.45"/>
        <text x="32" y="38" font-family="Georgia, serif" font-size="13"
              letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">TIME LEFT</text>
        <text x="32" y="80" font-family="Georgia, serif" font-size="42"
              font-weight="bold" fill="#ef4444">${secondsLeft}s</text>
        <text x="${W - 128}" y="38" text-anchor="end" font-family="Georgia, serif"
              font-size="13" letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">PLAYERS LEFT</text>
        <text x="${W - 128}" y="80" text-anchor="end" font-family="Georgia, serif"
              font-size="42" font-weight="bold" fill="#22c55e">${players.filter(p => !p.eliminated).length}</text>
      </g>
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

async function renderWcgWinCard({ winner, players = [], chainLen = 0, longestWord = '' }) {
    const W = 900, H = 560;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, '#22c55e')}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">WORD CHAIN · GAME OVER</text>
      <text x="48" y="138" font-family="Georgia, serif" font-size="44" font-weight="bold"
            fill="#fbbf24">🏆 WINNER</text>
      <text x="48" y="180" font-family="Georgia, serif" font-size="32"
            fill="#22c55e">@${esc((winner || '').split('@')[0] || '—')}</text>

      <g transform="translate(48, 220)">
        <rect width="${W - 96}" height="100" rx="18" fill="#000" fill-opacity="0.5"
              stroke="#22c55e" stroke-opacity="0.5"/>
        <text x="32" y="40" font-family="Georgia, serif" font-size="13"
              letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">CHAIN LENGTH</text>
        <text x="32" y="82" font-family="Georgia, serif" font-size="36"
              font-weight="bold" fill="#fbbf24">${chainLen} words</text>
        <text x="${W - 128}" y="40" text-anchor="end" font-family="Georgia, serif"
              font-size="13" letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">LONGEST WORD</text>
        <text x="${W - 128}" y="82" text-anchor="end" font-family="Georgia, serif"
              font-size="28" fill="#fef3c7">${esc(longestWord || '—')}</text>
      </g>

      <g transform="translate(48, 340)">
        <text font-family="Georgia, serif" font-size="13"
              letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">FINAL STANDINGS</text>
        <g transform="translate(0, 16)">${_playerLines(players, winner)}</g>
      </g>
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── TIC-TAC-TOE cards ────────────────────────────────────────────────────────
async function renderTttLobbyCard({ players = [], secondsLeft = 30 }) {
    const W = 900, H = 480;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, '#3b82f6')}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">TIC-TAC-TOE · LOBBY OPEN</text>
      <text x="48" y="138" font-family="Georgia, serif" font-size="44" font-weight="bold"
            fill="#fbbf24">CHALLENGE ACCEPTED?</text>
      <text x="48" y="172" font-family="Georgia, serif" font-size="18"
            fill="#e5e7eb" fill-opacity="0.75">Type .join  ·  or reply to me with "join"</text>

      <g transform="translate(48, 210)">
        <rect width="${W - 96}" height="180" rx="18" fill="#000" fill-opacity="0.5"
              stroke="#3b82f6" stroke-opacity="0.55"/>
        <text x="32" y="34" font-family="Georgia, serif" font-size="13"
              letter-spacing="5" fill="#e5e7eb" fill-opacity="0.75">PLAYERS (${players.length}/2)</text>
        <g transform="translate(0, 30)">${_playerLines(players)}</g>
      </g>

      <text x="48" y="430" font-family="Georgia, serif" font-size="14"
            letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">STARTS IN</text>
      <text x="${W - 48}" y="430" text-anchor="end" font-family="Georgia, serif"
            font-size="28" font-weight="bold" fill="#3b82f6">${secondsLeft}s</text>
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

function _tttGrid(cells, winLine = null) {
    // 600x600 board centered later
    const cell = 180, gap = 12;
    const total = cell * 3 + gap * 2;
    let svg = `<rect width="${total}" height="${total}" fill="#000" fill-opacity="0.4" rx="20"/>`;
    for (let i = 0; i < 9; i++) {
        const r = Math.floor(i / 3), c = i % 3;
        const x = c * (cell + gap), y = r * (cell + gap);
        const v = cells[i];
        const inWin = winLine && winLine.includes(i);
        const bg = inWin ? '#fbbf24' : '#0b0b10';
        const bgOp = inWin ? '0.18' : '0.85';
        svg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="14"
                fill="${bg}" fill-opacity="${bgOp}"
                stroke="${inWin ? '#fbbf24' : '#ef4444'}" stroke-opacity="${inWin ? 0.9 : 0.4}" stroke-width="2"/>`;
        if (v === 'X') {
            const m = 36;
            svg += `<line x1="${x + m}" y1="${y + m}" x2="${x + cell - m}" y2="${y + cell - m}" stroke="#ef4444" stroke-width="14" stroke-linecap="round"/>`;
            svg += `<line x1="${x + cell - m}" y1="${y + m}" x2="${x + m}" y2="${y + cell - m}" stroke="#ef4444" stroke-width="14" stroke-linecap="round"/>`;
        } else if (v === 'O') {
            svg += `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell / 2 - 36}" fill="none" stroke="#fbbf24" stroke-width="14"/>`;
        } else {
            svg += `<text x="${x + cell / 2}" y="${y + cell / 2 + 12}" text-anchor="middle"
                    font-family="Georgia, serif" font-size="40" fill="#e5e7eb" fill-opacity="0.18">${i + 1}</text>`;
        }
    }
    return { svg, total };
}

async function renderTttBoardCard({ cells, players, turn, header = '', winLine = null }) {
    const W = 900, H = 900;
    const grid = _tttGrid(cells, winLine);
    const gx = (W - grid.total) / 2;
    const playerX = players?.X ? '@' + players.X.split('@')[0] : '—';
    const playerO = players?.O ? '@' + players.O.split('@')[0] : '—';
    const turnLabel = turn === 'X' ? `${playerX} ❌` : turn === 'O' ? `${playerO} ⭕` : '—';

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, winLine ? '#fbbf24' : '#ef4444')}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">TIC-TAC-TOE</text>
      <text x="48" y="132" font-family="Georgia, serif" font-size="32" font-weight="bold"
            fill="#fbbf24">${esc(header || 'GAME ON')}</text>

      <text x="48" y="174" font-family="Georgia, serif" font-size="20"
            fill="#ef4444">${esc(playerX)} ❌</text>
      <text x="${W - 48}" y="174" text-anchor="end" font-family="Georgia, serif"
            font-size="20" fill="#fbbf24">⭕ ${esc(playerO)}</text>

      <g transform="translate(${gx}, 220)">${grid.svg}</g>

      <text x="${W / 2}" y="${H - 80}" text-anchor="middle" font-family="Georgia, serif"
            font-size="22" fill="#fef3c7">${winLine ? '🏆 ' + esc(turnLabel) + ' wins!' : 'Turn: ' + esc(turnLabel)}</text>
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── REPO / NETWORK CARD ──────────────────────────────────────────────────────
async function renderRepoCard({
    botName = 'SUKUNA MD',
    tagline = 'King of Curses · Bot Network',
    servers = [],          // [{ emoji, label, url }]
    channelLabel = 'WhatsApp Channel',
    channelUrl   = '',
}) {
    const W = 1000, H = 760;
    const accent = '#fbbf24';

    // Server tile rows (max 6)
    const tiles = servers.slice(0, 6).map((s, i) => {
        const x = 48 + (i % 2) * ((W - 96) / 2 + 12);
        const y = 240 + Math.floor(i / 2) * 110;
        const w = (W - 96 - 12) / 2;
        return `
        <g transform="translate(${x}, ${y})">
          <rect width="${w}" height="92" rx="16" fill="#000" fill-opacity="0.55"
                stroke="${accent}" stroke-opacity="0.45"/>
          <text x="22" y="40" font-family="Georgia, serif" font-size="28">${esc(s.emoji || '✦')}</text>
          <text x="64" y="38" font-family="Georgia, serif" font-size="20"
                font-weight="bold" fill="#fbbf24">${esc(s.label || '')}</text>
          <text x="64" y="68" font-family="'Courier New', monospace" font-size="13"
                fill="#e5e7eb" fill-opacity="0.75">${esc(s.url || '')}</text>
        </g>`;
    }).join('');

    const channelBlock = channelUrl ? `
        <g transform="translate(48, ${H - 200})">
          <rect width="${W - 96}" height="110" rx="18" fill="#0b3a2a" fill-opacity="0.7"
                stroke="#22c55e" stroke-opacity="0.65"/>
          <text x="28" y="42" font-family="Georgia, serif" font-size="13"
                letter-spacing="5" fill="#bbf7d0">📣  OFFICIAL ${esc(channelLabel.toUpperCase())}</text>
          <text x="28" y="82" font-family="'Courier New', monospace" font-size="16"
                fill="#fef3c7">${esc(channelUrl)}</text>
        </g>` : '';

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, accent)}

      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.75">CURSED NETWORK · DIRECTORY</text>
      <text x="48" y="142" font-family="Georgia, serif" font-size="52" font-weight="bold"
            fill="#fbbf24">${esc(botName)}</text>
      <text x="48" y="178" font-family="Georgia, serif" font-size="20"
            fill="#e5e7eb" fill-opacity="0.7">${esc(tagline)}</text>

      <line x1="48" y1="210" x2="${W - 48}" y2="210"
            stroke="#fbbf24" stroke-opacity="0.3"/>

      ${tiles}
      ${channelBlock}

      ${footer(W, H, '꧁ Malevolent Network · Active ꧂')}
    </svg>`;
    return svgToPng(svg);
}

// ── UPTIME CARD ──────────────────────────────────────────────────────────────
async function renderUptimeCard({
    botUptime = '0s',
    sysUptime = '0s',
    platform  = '—',
    arch      = '—',
    totalMem  = '0',
    freeMem   = '0',
    botMem    = '0',
    botName   = 'SUKUNA · MD',
} = {}) {
    const W = 980, H = 540;
    const accent = '#a855f7';
    const tile = (label, value, x, y, sub = '') => `
      <g transform="translate(${x}, ${y})">
        <rect width="280" height="120" rx="16" fill="#000" fill-opacity="0.45"
              stroke="${accent}" stroke-opacity="0.35"/>
        <text x="20" y="34" font-family="Georgia, serif" font-size="12"
              letter-spacing="4" fill="#e5e7eb" fill-opacity="0.7">${esc(label)}</text>
        <text x="20" y="80" font-family="Georgia, serif" font-size="30"
              font-weight="bold" fill="#fbbf24">${esc(value)}</text>
        ${sub ? `<text x="20" y="105" font-family="Georgia, serif" font-size="13"
              fill="#e5e7eb" fill-opacity="0.7">${esc(sub)}</text>` : ''}
      </g>`;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, accent)}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.7">SYSTEM · LIVE STATUS</text>
      <text x="48" y="130" font-family="Georgia, serif" font-size="42" font-weight="bold"
            fill="#fbbf24">${esc(botName)}</text>
      <text x="48" y="160" font-family="Georgia, serif" font-size="16"
            fill="#e5e7eb" fill-opacity="0.85">⚡ Online · all cursed engines running</text>

      ${tile('BOT UPTIME', botUptime, 48,  200)}
      ${tile('SYSTEM UPTIME', sysUptime, 348, 200)}
      ${tile('BOT MEMORY', `${botMem} MB`, 648, 200)}
      ${tile('PLATFORM', `${platform}`, 48,  340, arch)}
      ${tile('TOTAL RAM', `${totalMem} GB`, 348, 340)}
      ${tile('FREE RAM',  `${freeMem} GB`,  648, 340)}

      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── GENERIC TEXT CARD (used by all economy command replies) ─────────────────
async function renderTextCard({
    title  = 'SUKUNA',
    subtitle = '',
    body   = '',
    accent = '#ef4444',
    badge  = 'ECONOMY · LIVE',
} = {}) {
    // Strip surrounding box characters added by boxify (we'll re-frame in SVG).
    const raw = String(body || '').replace(/[╭╰─┃│╮╯]/g, '').trim();
    const lines = raw.split('\n').map(l => l.replace(/\s+$/,'')).filter(l => l.trim().length || true);

    // Layout sizing
    const W = 960;
    const lineH = 30;
    const top = 200;
    const bottomPad = 90;
    const visible = lines.slice(0, 22); // hard cap
    const H = Math.max(360, top + visible.length * lineH + bottomPad);

    const renderLine = (line, i) => {
        const y = top + i * lineH;
        // Bold-ish heading if line starts and ends with *
        const m = line.match(/^\s*\*(.+)\*\s*$/);
        if (m) {
            return `<text x="48" y="${y}" font-family="Georgia, serif" font-size="20"
                font-weight="bold" fill="#fbbf24">${esc(m[1])}</text>`;
        }
        return `<text x="48" y="${y}" font-family="Georgia, serif" font-size="18"
            fill="#f5f5f5">${esc(line.replace(/\*/g, ''))}</text>`;
    };

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${chrome(W, H, accent)}
      <text x="48" y="78" font-family="Georgia, serif" font-size="14"
            letter-spacing="6" fill="#e5e7eb" fill-opacity="0.7">${esc(badge)}</text>
      <text x="48" y="128" font-family="Georgia, serif" font-size="38" font-weight="bold"
            fill="#fbbf24">${esc(title)}</text>
      ${subtitle ? `<text x="48" y="160" font-family="Georgia, serif" font-size="16"
            fill="#e5e7eb" fill-opacity="0.85">${esc(subtitle)}</text>` : ''}
      ${visible.map(renderLine).join('\n')}
      ${footer(W, H)}
    </svg>`;
    return svgToPng(svg);
}

// ── CALENDAR CARD ────────────────────────────────────────────────────────────
// Cyber blue/purple style (same family as renderAliveCard / renderUptimeCard).
// Draws an actual month grid with today highlighted, plus a side info panel:
// date, time, region/country, week/day-of-year, and live weather.
function _calWeatherAccent(code) {
    const c = parseInt(code, 10) || 0;
    if ([113].includes(c)) return { accent: '#fbbf24', emoji: '☀️' };
    if ([116, 119, 122].includes(c)) return { accent: '#94a3b8', emoji: '☁️' };
    if ([143, 248, 260].includes(c)) return { accent: '#a3a3a3', emoji: '🌫️' };
    if ([176,263,266,281,284,293,296,299,302,305,308,311,314,317,320,353,356,359,362,365,368].includes(c))
        return { accent: '#3b82f6', emoji: '🌧️' };
    if ([179,182,185,227,230,323,326,329,332,335,338,350,371,374,377,392,395].includes(c))
        return { accent: '#22d3ee', emoji: '❄️' };
    if ([200,386,389].includes(c)) return { accent: '#a855f7', emoji: '⛈️' };
    return { accent: '#fbbf24', emoji: '🌤️' };
}

function _buildMonthMatrix(year, monthIdx, todayDate) {
    // monthIdx: 0-11. Returns array of weeks, each week an array of 7 cells
    // ({ day, isToday } | null for padding).
    const firstOfMonth = new Date(year, monthIdx, 1);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth   = new Date(year, monthIdx + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ day: d, isToday: d === todayDate });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

async function renderCalendarCard({
    botName    = 'SUKUNA MD',
    year, monthIdx, monthName = '', todayDate = 1,
    weekday    = '',
    fullDate   = '',
    timeStr    = '',
    timezone   = '',
    region     = '',
    country    = '',
    weekNum    = 0,
    dayOfYear  = 0,
    daysInYear = 365,
    tempC, condition = '', humidity, windKph, weatherCode = 0,
} = {}) {
    const W = 1040, H = 800;
    const hasWeather = tempC !== undefined && tempC !== null;
    const { accent, emoji } = hasWeather ? _calWeatherAccent(weatherCode) : { accent: '#22d3ee', emoji: '🗓️' };

    const grid = `
      <pattern id="calgrid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#22d3ee" stroke-opacity="0.06" stroke-width="1"/>
      </pattern>
      <linearGradient id="calbg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stop-color="#05060d"/>
        <stop offset="55%"  stop-color="#0a0d1f"/>
        <stop offset="100%" stop-color="#1a0a2e"/>
      </linearGradient>
      <radialGradient id="calCyan" cx="10%" cy="14%" r="55%">
        <stop offset="0%"   stop-color="#22d3ee" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="calMag" cx="94%" cy="92%" r="55%">
        <stop offset="0%"   stop-color="#a855f7" stop-opacity="0.40"/>
        <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="calTitle" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="#22d3ee"/>
        <stop offset="50%"  stop-color="#e0f2fe"/>
        <stop offset="100%" stop-color="#a855f7"/>
      </linearGradient>
      <pattern id="calscan" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="2" fill="transparent"/>
        <rect y="2" width="3" height="1" fill="#ffffff" fill-opacity="0.03"/>
      </pattern>`;

    // ── Month grid (left side) ──────────────────────────────────────────────
    const weeks = _buildMonthMatrix(year, monthIdx, todayDate);
    const gx = 48, gy = 250;
    const cellW = 62, cellH = 52;
    const dayLabels = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

    const dayHeaderSvg = dayLabels.map((lbl, i) => `
        <text x="${gx + i * cellW + cellW/2}" y="${gy - 14}" text-anchor="middle"
              font-family="'Courier New', monospace" font-size="12" letter-spacing="1"
              fill="${i === 0 || i === 6 ? '#a855f7' : '#67e8f9'}" fill-opacity="0.85">${lbl}</text>`).join('');

    const cellsSvg = weeks.map((week, wi) => week.map((cell, di) => {
        if (!cell) return '';
        const x = gx + di * cellW;
        const y = gy + wi * cellH;
        const isWeekend = di === 0 || di === 6;
        if (cell.isToday) {
            return `
              <g transform="translate(${x}, ${y})">
                <rect x="4" y="4" width="${cellW - 12}" height="${cellH - 12}" rx="10"
                      fill="${accent}" fill-opacity="0.9"/>
                <rect x="4" y="4" width="${cellW - 12}" height="${cellH - 12}" rx="10"
                      fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="1.5"/>
                <text x="${(cellW-12)/2 + 4}" y="${(cellH-12)/2 + 10}" text-anchor="middle"
                      font-family="Georgia, serif" font-size="20" font-weight="bold"
                      fill="#05060d">${cell.day}</text>
              </g>`;
        }
        return `
          <text x="${x + cellW/2}" y="${y + cellH/2 + 6}" text-anchor="middle"
                font-family="Georgia, serif" font-size="18"
                fill="${isWeekend ? '#c4b5fd' : '#e0f2fe'}" fill-opacity="0.85">${cell.day}</text>`;
    }).join('')).join('');

    const gridH = weeks.length * cellH;

    // ── Side info panel (right side) ────────────────────────────────────────
    const infoX = gx + 7 * cellW + 36;
    const infoW = W - infoX - 48;

    const infoTile = (y, label, value, h = 84) => `
      <g transform="translate(0, ${y})">
        <rect width="${infoW}" height="${h}" rx="14" fill="#0b0d18" fill-opacity="0.85"
              stroke="${accent}" stroke-opacity="0.5" stroke-width="1"/>
        <rect width="${infoW}" height="3" rx="1.5" fill="${accent}"/>
        <text x="18" y="32" font-family="'Courier New', monospace" font-size="11"
              letter-spacing="2.5" fill="#94a3b8">${esc(label)}</text>
        <text x="18" y="${h - 16}" font-family="Georgia, serif" font-size="20"
              font-weight="bold" fill="#e0f2fe">${esc(value)}</text>
      </g>`;

    const place = [region, country].filter(Boolean).join(', ') || '—';

    let y = 250;
    const blocks = [];
    blocks.push(infoTile(y, 'LOCAL TIME', timeStr || '—')); y += 88;
    blocks.push(infoTile(y, 'TIMEZONE', timezone || '—'));  y += 88;
    blocks.push(infoTile(y, 'REGION', place));               y += 88;
    blocks.push(infoTile(y, 'WEEK · DAY OF YEAR', `Wk ${weekNum} · ${dayOfYear}/${daysInYear}`)); y += 88;

    const weatherBlock = hasWeather ? `
      <g transform="translate(0, ${y})">
        <rect width="${infoW}" height="100" rx="14" fill="#0b0d18" fill-opacity="0.85"
              stroke="${accent}" stroke-opacity="0.55" stroke-width="1"/>
        <rect width="${infoW}" height="3" rx="1.5" fill="${accent}"/>
        <text x="18" y="30" font-family="'Courier New', monospace" font-size="11"
              letter-spacing="2.5" fill="#94a3b8">WEATHER NOW</text>
        <text x="18" y="76" font-family="Georgia, serif" font-size="30" font-weight="bold"
              fill="${accent}">${tempC}°C</text>
        <text x="${infoW - 18}" y="46" text-anchor="end" font-family="Georgia, serif"
              font-size="34">${emoji}</text>
        <text x="${infoW - 18}" y="78" text-anchor="end" font-family="Georgia, serif"
              font-size="14" fill="#e0f2fe" fill-opacity="0.85">${esc(condition)}${humidity !== undefined ? ` · ${humidity}%` : ''}${windKph !== undefined ? ` · ${windKph}km/h` : ''}</text>
      </g>` : '';

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>${grid}</defs>

      <rect width="${W}" height="${H}" fill="url(#calbg)"/>
      <rect width="${W}" height="${H}" fill="url(#calgrid)"/>
      <rect width="${W}" height="${H}" fill="url(#calCyan)"/>
      <rect width="${W}" height="${H}" fill="url(#calMag)"/>
      <rect width="${W}" height="${H}" fill="url(#calscan)"/>

      <rect x="10" y="10" width="${W-20}" height="${H-20}" rx="22" fill="none"
            stroke="#22d3ee" stroke-opacity="0.55" stroke-width="1.5"/>
      <rect x="18" y="18" width="${W-36}" height="${H-36}" rx="18" fill="none"
            stroke="#a855f7" stroke-opacity="0.35" stroke-width="1"/>

      ${[
        [28, 28, 1, 1],
        [W-28, 28, -1, 1],
        [28, H-28, 1, -1],
        [W-28, H-28, -1, -1],
      ].map(([cx, cy, sx, sy]) => `
        <path d="M ${cx} ${cy + 24*sy} L ${cx} ${cy} L ${cx + 24*sx} ${cy}"
              stroke="#22d3ee" stroke-width="2" fill="none" stroke-opacity="0.85"/>`).join('')}

      <text x="48" y="72" font-family="'Courier New', monospace" font-size="13"
            letter-spacing="8" fill="#67e8f9" fill-opacity="0.85">CAL://SYNC · LIVE</text>

      <g transform="translate(${W - 230}, 50)">
        <rect width="182" height="32" rx="16" fill="#022c22" stroke="#10b981" stroke-opacity="0.7"/>
        <circle cx="20" cy="16" r="6" fill="#10b981"/>
        <circle cx="20" cy="16" r="10" fill="none" stroke="#10b981" stroke-opacity="0.45"/>
        <text x="38" y="21" font-family="'Courier New', monospace" font-size="13"
              letter-spacing="2" fill="#a7f3d0">${esc(weekday.toUpperCase() || 'TODAY')}</text>
      </g>

      <text x="48" y="150" font-family="Georgia, serif" font-size="56"
            font-weight="bold" fill="url(#calTitle)">${esc(monthName)} ${year}</text>
      <text x="48" y="182" font-family="Georgia, serif" font-size="17"
            font-style="italic" fill="#cbd5e1" fill-opacity="0.85">${esc(fullDate)}</text>

      <line x1="48" y1="208" x2="${W-48}" y2="208"
            stroke="#22d3ee" stroke-opacity="0.35" stroke-width="1"/>

      ${dayHeaderSvg}
      ${cellsSvg}

      <g transform="translate(${infoX}, 0)">
        ${blocks.join('')}
        ${weatherBlock}
      </g>

      <line x1="48" y1="${H-58}" x2="${W-48}" y2="${H-58}"
            stroke="#a855f7" stroke-opacity="0.45" stroke-width="1"/>
      <text x="${W/2}" y="${H-30}" text-anchor="middle"
            font-family="Georgia, serif" font-size="13" letter-spacing="8"
            fill="#67e8f9" fill-opacity="0.85">꧁ ${esc(botName)} · TEMPORAL ARCHIVE ꧂</text>
    </svg>`;

    return svgToPng(svg);
}

// ── BOTSTATS INFORMATION TABLE (reference-style portrait card) ────────────────
async function renderBotStatsCard({
    botName = 'SUKUNA · MD',
    status = 'ONLINE',
    packageName = '@pasqua-baileys/baileys',
    version = '—',
    prefix = '.',
    uptime = '—',
    panelResponse = '—',
    commandTotal = 0,
    uniqueCommands = 0,
    topCommand = '—',
    lastCommand = '—',
    runtime = '—',
    memory = '—',
    cpu = '—',
    timestamp = '—',
} = {}) {
    const W = 1000;
    const leftW = 310;
    const rowTop = 158;
    const rowGap = 8;
    const rowPad = 18;
    const fontSize = 22;
    const lineH = 29;
    const maxValueChars = 34;
    const wrap = value => {
        const text = String(value ?? '—').trim() || '—';
        const words = text.split(/\s+/);
        const lines = [];
        let line = '';
        for (const word of words) {
            if (!line) { line = word; continue; }
            if ((line + ' ' + word).length <= maxValueChars) line += ' ' + word;
            else { lines.push(line); line = word; }
        }
        if (line) lines.push(line);
        return lines.slice(0, 4);
    };
    const rows = [
        ['🤖 Bot', botName],
        ['📦 Package', packageName],
        ['📝 Status', status],
        ['🏷️ Version', version],
        ['⌨️ Prefix', prefix],
        ['⏱️ Uptime', uptime],
        ['⚡ Panel Response', panelResponse],
        ['🧮 Commands Run', Number(commandTotal).toLocaleString('en-US')],
        ['🧩 Unique Commands', Number(uniqueCommands).toLocaleString('en-US')],
        ['🏆 Top Command', topCommand],
        ['🕘 Last Command', lastCommand],
        ['💾 Memory', memory],
        ['🖥️ Runtime', runtime],
        ['⚙️ CPU', cpu],
        ['🕒 Updated', timestamp],
    ];
    const layouts = rows.map(([label, value]) => ({ label, lines: wrap(value) }));
    const heights = layouts.map(row => Math.max(66, rowPad * 2 + row.lines.length * lineH));
    const H = rowTop + heights.reduce((sum, height) => sum + height + rowGap, 0) + 82;
    const escText = value => esc(value);
    let y = rowTop;
    const rowSvg = layouts.map((row, index) => {
        const h = heights[index];
        const valueLines = row.lines.map((line, lineIndex) =>
            `<text x="${leftW + 38}" y="${y + 36 + lineIndex * lineH}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#f1f5f9">${escText(line)}</text>`
        ).join('');
        const result = `
          <g>
            <rect x="28" y="${y}" width="${W - 56}" height="${h}" fill="#15191c" stroke="#30373b" stroke-width="1"/>
            <line x1="${leftW}" y1="${y}" x2="${leftW}" y2="${y + h}" stroke="#3a4247" stroke-width="1"/>
            <text x="50" y="${y + 36}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#f8fafc">${escText(row.label)}</text>
            ${valueLines}
          </g>`;
        y += h + rowGap;
        return result;
    }).join('');
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="statsBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#070a0c"/>
          <stop offset="100%" stop-color="#111619"/>
        </linearGradient>
        <pattern id="statsGrid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M 42 0 L 0 0 0 42" fill="none" stroke="#cbd5e1" stroke-opacity="0.035"/>
        </pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#statsBg)"/>
      <rect width="${W}" height="${H}" fill="url(#statsGrid)"/>
      <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="#394247" stroke-width="2"/>
      <text x="40" y="66" font-family="Arial, sans-serif" font-size="18" letter-spacing="5" fill="#aab4ba">BOTSTAT · SYSTEM PROFILE</text>
      <text x="${W - 40}" y="66" text-anchor="end" font-family="Arial, sans-serif" font-size="17" letter-spacing="3" fill="#72e0a2">● ${escText(status)}</text>
      <text x="40" y="108" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#f8fafc">${escText(botName)}</text>
      <text x="${W - 40}" y="108" text-anchor="end" font-family="Arial, sans-serif" font-size="15" fill="#8d999f">METRICS SINCE PROCESS START</text>
      <line x1="40" y1="128" x2="${W - 40}" y2="128" stroke="#3a4247"/>
      ${rowSvg}
      <text x="${W / 2}" y="${H - 30}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" letter-spacing="4" fill="#7e8a90">SUKUNA MD · LIVE TELEMETRY</text>
    </svg>`;
    return svgToPng(svg);
}

module.exports = {
    renderWalletCard,
    renderEarningsCard,
    renderCrimeCard,
    renderTravelCard,
    renderProfileCard,
    renderHealthCard,
    renderAliveCard,
    renderWeatherCard,
    renderWcgLobbyCard,
    renderWcgTurnCard,
    renderWcgWinCard,
    renderTttLobbyCard,
    renderTttBoardCard,
    renderRepoCard,
    renderUptimeCard,
    renderBotStatsCard,
    renderTextCard,
    renderCalendarCard,
};


'use strict';

const crypto = require('crypto');
const { generateWAMessageFromContent, proto } = require('@pasqua-dev/baileys');
const { sendRichHtml, escapeHtml } = require('../../utils/genaiRich');

const SESSIONS = new Map();
const ACTIONS = [
    { id: 'analyze', label: 'Analyze', tone: 'cyan', icon: '🔵', meaning: 'available action' },
    { id: 'explain', label: 'Explain', tone: 'violet', icon: '🟣', meaning: 'AI reasoning' },
    { id: 'review', label: 'Review', tone: 'amber', icon: '🟡', meaning: 'needs attention' },
    { id: 'approve', label: 'Approve', tone: 'green', icon: '🟢', meaning: 'confirmed action' },
    { id: 'stop', label: 'Stop', tone: 'red', icon: '🔴', meaning: 'risk or cancel' },
    { id: 'reset', label: 'Reset', tone: 'slate', icon: '⚪', meaning: 'return to start' },
];

function quickReply(label, id) {
    return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: label, id }) };
}

async function sendNativeStrip({ sock, jid, quoted, session }) {
    const buttons = ACTIONS.slice(0, 3).map(action => quickReply(`${action.icon} ${action.label}`, `chromatic:${session.id}:${action.id}`));
    const content = {
        body: { text: `CHROMATIC CONTROLS\nNative action strip · session ${session.id.slice(0, 8)}` },
        footer: { text: 'SUKUNA MD · Native action comparison' },
        header: { title: 'CHROMATIC CONTROLS', hasMediaAttachment: false },
        nativeFlowMessage: { buttons, messageParamsJson: '' },
    };
    const wrapped = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject(content),
            },
        },
    }, { userJid: sock.user?.id, quoted: quoted?.message ? quoted : undefined });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
}

function chromaticHtml(session) {
    const selected = ACTIONS.find(action => action.id === session.selected) || ACTIONS[0];
    const controls = ACTIONS.map(action => `<button class="control ${action.tone} ${session.selected === action.id ? 'selected' : ''}" data-action="${action.id}" onclick="choose('${action.id}')"><span class="icon">${action.icon}</span><span class="control-copy"><b>${action.label}</b><small>${action.meaning}</small></span><span class="chevron">›</span></button>`).join('');
    const legend = ACTIONS.map(action => `<div class="legend-row"><span class="legend-dot ${action.tone}"></span><span>${action.label}</span><small>${action.meaning}</small></div>`).join('');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:#03070d;font-family:Arial,sans-serif}body{padding:8px;color:#edf8ff}.card{width:100%;max-width:560px;margin:auto;border:1px solid #31516b;border-radius:18px;background:linear-gradient(155deg,#102238 0%,#071321 48%,#040a12 100%);box-shadow:0 10px 26px #000b,inset 0 0 26px #1a7ac022;overflow:hidden}.top{padding:18px 18px 14px;border-bottom:1px solid #25435a}.eyebrow{color:#72cfff;font:10px monospace;letter-spacing:2px}.title{margin-top:7px;color:#f6fcff;font:bold 23px Arial,sans-serif;letter-spacing:.3px}.title b{color:#50cfff}.session{margin-top:7px;color:#7f9caf;font:10px monospace}.section{padding:15px 18px;border-bottom:1px solid #1c3345}.section-label{margin-bottom:9px;color:#79a6c2;font:10px monospace;letter-spacing:1.4px;text-transform:uppercase}.status-line{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;border:1px solid #2d526c;border-radius:9px;background:#071725;font:12px monospace}.status-line strong{text-transform:uppercase}.tone-cyan{color:#47d7ff}.tone-violet{color:#c18cff}.tone-amber{color:#ffd36a}.tone-green{color:#5dffb0}.tone-red{color:#ff7180}.tone-slate{color:#b7c9d7}.controls{display:flex;flex-direction:column;gap:7px}.control{width:100%;min-height:51px;display:grid;grid-template-columns:30px 1fr 18px;align-items:center;gap:9px;padding:9px 12px;border:1px solid #294457;border-radius:10px;color:#dceeff;background:#081725;text-align:left;box-shadow:none}.control:hover,.control.selected{border-color:currentColor;background:linear-gradient(90deg,#12314a,#0a1b2b)}.control:active{transform:scale(.99)}.icon{font-size:17px}.control-copy{display:flex;flex-direction:column;gap:3px}.control-copy b{color:#f0f8ff;font-size:14px}.control-copy small{color:#8fa9b8;font:10px monospace}.chevron{color:currentColor;font-size:24px;text-align:right}.legend{display:flex;flex-direction:column;gap:6px}.legend-row{display:grid;grid-template-columns:10px 90px 1fr;align-items:center;gap:8px;color:#d3e4ed;font:11px monospace}.legend-row small{color:#7893a3}.legend-dot{width:7px;height:7px;border-radius:50%;background:currentColor}.native{padding:12px 18px;color:#86a8ba;background:#06111d;font:10px/1.45 monospace}.footer{padding:12px 18px;text-align:center;color:#54809b;font:10px monospace;letter-spacing:1px}
</style></head><body><div class="card"><div class="top"><div class="eyebrow">SUKUNA EXPERIMENT / CONTROL PANEL</div><div class="title">Chromatic <b>Controls</b></div><div class="session">SESSION ${session.id.slice(0, 8)}</div></div><div class="section"><div class="section-label">Current state</div><div class="status-line"><span>STATE</span><strong class="${selected.tone}">${selected.label}</strong></div></div><div class="section"><div class="section-label">Choose one action</div><div class="controls">${controls}</div></div><div class="section"><div class="section-label">Action guide</div><div class="legend">${legend}</div></div><div class="native">NATIVE ACTION STRIP<br><span>Use the WhatsApp controls below for actions that need bot routing.</span></div><div class="footer">COLOUR IS STATE · SUKUNA MD</div></div><script>function choose(action){document.querySelectorAll('.control').forEach(function(button){button.classList.toggle('selected',button.dataset.action===action)});var labels={analyze:'Analyze',explain:'Explain',review:'Review',approve:'Approve',stop:'Stop',reset:'Reset'},tones={analyze:'cyan',explain:'violet',review:'amber',approve:'green',stop:'red',reset:'slate'};var status=document.querySelector('.status-line strong');if(status){status.textContent=labels[action];status.className='tone-'+tones[action]}}</script></body></html>`;
}

function createSession() {
    const session = { id: crypto.randomUUID(), selected: 'analyze' };
    SESSIONS.set(session.id, session);
    setTimeout(() => SESSIONS.delete(session.id), 30 * 60 * 1000).unref?.();
    return session;
}

async function handleButton(buttonId, { sock, msg, from }) {
    const match = String(buttonId || '').match(/^chromatic:([^:]+):(analyze|explain|review|approve|stop|reset)$/);
    if (!match) return false;
    const [, id, action] = match;
    const session = SESSIONS.get(id);
    if (!session) {
        await sock.sendMessage(from, { text: 'This Chromatic Controls session expired. Run `.chromatic` again.' }, { quoted: msg });
        return true;
    }
    session.selected = action;
    await sendRichHtml({ sock, jid: from, quoted: msg, html: chromaticHtml(session) });
    return true;
}

module.exports = {
    name: 'chromatic',
    aliases: ['colors', 'colourbuttons'],
    description: 'Organized coloured WhatsApp controls panel',
    usage: '.chromatic',
    category: 'expansion',
    async execute({ sock, msg, from, reply }) {
        try {
            const session = createSession();
            await sendRichHtml({ sock, jid: from, quoted: msg, html: chromaticHtml(session) });
            await sendNativeStrip({ sock, jid: from, quoted: msg, session });
        } catch (error) {
            console.error('[CHROMATIC]', error);
            await reply(`Chromatic Controls failed: ${error.message}`);
        }
    },
    handleButton,
};

module.exports.chromaticHtml = chromaticHtml;

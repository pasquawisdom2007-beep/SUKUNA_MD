'use strict';

const config = require('../../config');
const database = require('../../utils/database');
const sessionManager = require('../../lib/sessionManager');

function onOff(value) {
    return value ? 'ON' : 'OFF';
}

module.exports = {
    name: 'safeconfig',
    aliases: ['safe-config', 'safetyconfig', 'safety'],
    description: 'Show outbound throttling and automation safety settings',
    category: 'owner',
    ownerOnly: true,

    async execute({ reply, phoneNumber }) {
        const antiBan = config.antiBan || {};
        const autoAdd = database.getAutoAdd();
        const current = sessionManager.getSession(phoneNumber);
        const runtime = current?.antiBan?.getStatus?.() || {};

        const lines = [
            '╔══════════════════════════╗',
            '║       SAFE CONFIG        ║',
            '╚══════════════════════════╝',
            '',
            'OUTBOUND THROTTLE',
            `Engine       : ${onOff(antiBan.enabled !== false)}`,
            `Max / second: ${antiBan.maxMessagesPerSecond || 'default'}`,
            `Message gap  : ${antiBan.messageRateLimit || 'default'} ms`,
            `API gap      : ${antiBan.apiThrottleMs || 'default'} ms`,
            `Error pause  : ${antiBan.autoPauseDuration || 'default'} ms`,
            `Runtime      : ${runtime.isAutoPaused ? 'PAUSED' : 'READY'}`,
            `Queue        : ${runtime.messageQueueLength ?? 'n/a'}`,
            `Errors       : ${runtime.errorCount ?? 'n/a'}`,
            '',
            'AUTOMATION',
            `Auto-add     : ${onOff(autoAdd.enabled)}`,
            `Auto-add wait: ${autoAdd.delaySeconds || 0}s`,
            `Auto-view    : ${onOff(database.getAutoViewStatus(phoneNumber))}`,
            `Auto-save    : ${onOff(database.getAutoSaveStatus(phoneNumber))}`,
            `Auto-read    : ${onOff(database.getAutoRead(phoneNumber))}`,
            `Auto-typing  : ${onOff(database.getAutoTyping(phoneNumber))}`,
            `Auto-record  : ${onOff(database.getAutoRecording(phoneNumber))}`,
            `Ghost mode   : ${onOff(database.getGhostMode(phoneNumber))}`,
            '',
            '_These settings reduce accidental bursts; they cannot guarantee immunity from platform enforcement._',
        ];

        return reply(lines.join('\n'));
    },
};

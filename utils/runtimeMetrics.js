'use strict';

const startedAt = Date.now();
const commandCounts = new Map();
const latencySamples = [];
const MAX_SAMPLES = 300;
let totalCommands = 0;
let lastCommand = null;

function recordCommand(name, durationMs) {
    const commandName = String(name || 'unknown').toLowerCase();
    const duration = Math.max(0, Math.round(Number(durationMs) || 0));
    totalCommands += 1;
    commandCounts.set(commandName, (commandCounts.get(commandName) || 0) + 1);
    latencySamples.push(duration);
    if (latencySamples.length > MAX_SAMPLES) latencySamples.shift();
    lastCommand = { name: commandName, durationMs: duration, at: Date.now() };
}

function percentile(values, fraction) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(fraction * ordered.length) - 1));
    return ordered[index];
}

function getRuntimeMetrics() {
    const entries = [...commandCounts.entries()].sort((a, b) => b[1] - a[1]);
    const recent = latencySamples.slice();
    const average = recent.length
        ? Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length)
        : 0;
    return {
        startedAt,
        totalCommands,
        uniqueCommands: commandCounts.size,
        commandCounts: Object.fromEntries(entries),
        topCommand: entries[0] ? { name: entries[0][0], count: entries[0][1] } : null,
        lastCommand,
        samples: recent.length,
        averageResponseMs: average,
        p50ResponseMs: percentile(recent, 0.5),
        p95ResponseMs: percentile(recent, 0.95),
    };
}

module.exports = { recordCommand, getRuntimeMetrics };

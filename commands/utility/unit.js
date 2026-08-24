'use strict';

const { prefixOf, truncate } = require('../../utils/commandHelpers');

const GROUPS = {
    length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
    mass: { g: 1, kg: 1000, mg: 0.001, lb: 453.59237, oz: 28.349523125 },
    data: { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 },
    time: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800 },
    speed: { mps: 1, kph: 1000 / 3600, mph: 1609.344 / 3600, knot: 1852 / 3600 },
};

const ALIASES = {
    meter: 'm', meters: 'm', metre: 'm', metres: 'm', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
    centimeter: 'cm', centimeters: 'cm', millimeter: 'mm', millimeters: 'mm', mile: 'mi', miles: 'mi', yard: 'yd', yards: 'yd', foot: 'ft', feet: 'ft', inch: 'in', inches: 'in',
    gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg', milligram: 'mg', milligrams: 'mg', pound: 'lb', pounds: 'lb', ounce: 'oz', ounces: 'oz',
    byte: 'b', bytes: 'b', kbyte: 'kb', kbytes: 'kb', kib: 'kb', mbyte: 'mb', mbytes: 'mb', mib: 'mb', gbyte: 'gb', gbytes: 'gb', gib: 'gb', tbyte: 'tb', tbytes: 'tb', tib: 'tb',
    millisecond: 'ms', milliseconds: 'ms', second: 's', seconds: 's', minute: 'min', minutes: 'min', hour: 'h', hours: 'h', days: 'day', weeks: 'week',
    'm/s': 'mps', 'm/sec': 'mps', 'km/h': 'kph', 'km/hr': 'kph', 'mph': 'mph', 'kn': 'knot', 'knots': 'knot',
};

function canonical(unit) {
    const value = unit.toLowerCase();
    return ALIASES[value] || value;
}

function temperature(value, unit) {
    if (unit === 'c') return value;
    if (unit === 'f') return (value - 32) * (5 / 9);
    if (unit === 'k') return value - 273.15;
    return null;
}

function fromCelsius(value, unit) {
    if (unit === 'c') return value;
    if (unit === 'f') return value * (9 / 5) + 32;
    if (unit === 'k') return value + 273.15;
    return null;
}

module.exports = {
    name: 'unit',
    aliases: ['convertunit', 'unitconvert'],
    description: 'Convert common length, mass, data, time, speed, and temperature units',
    usage: '.unit <amount unit to unit>',
    category: 'utility',

    async execute({ reply, args, prefix }) {
        const px = prefixOf(prefix);
        const expression = (args || []).join(' ').trim();
        const match = expression.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-zA-Z/]+)\s*(?:to|in|->)\s*([a-zA-Z/]+)$/i);
        if (!match) return reply(`📏 *Unit Converter*\n\nUsage: ${px}unit <amount unit to unit>\nExample: ${px}unit 10 km to mi`);
        const amount = Number(match[1]);
        const source = canonical(match[2]);
        const target = canonical(match[3]);
        let result;
        let group;
        if (['c', 'f', 'k'].includes(source) && ['c', 'f', 'k'].includes(target)) {
            result = fromCelsius(temperature(amount, source), target);
            group = 'temperature';
        } else {
            for (const [name, units] of Object.entries(GROUPS)) {
                if (units[source] && units[target]) {
                    result = amount * units[source] / units[target];
                    group = name;
                    break;
                }
            }
        }
        if (result === undefined || !group) return reply(`❌ Unsupported conversion: ${match[2]} → ${match[3]}.`);
        return reply(`📏 *Unit Conversion* · ${group}\n\n${amount} ${source} = *${Number(result.toPrecision(10))} ${target}*`);
    },
};

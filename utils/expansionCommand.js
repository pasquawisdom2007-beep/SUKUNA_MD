'use strict';

const https = require('https');

function fetchJson(url, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: { 'user-agent': 'SukunaMD/1.0', accept: 'application/json' },
        }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk;
                if (body.length > 1000000) request.destroy(new Error('Response too large'));
            });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
                try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON response')); }
            });
        });
        request.setTimeout(timeoutMs, () => request.destroy(new Error('Request timed out')));
        request.on('error', reject);
    });
}

function clean(value, max = 1600) {
    return String(value ?? '').slice(0, max).replace(/[\u0000-\u001F\u007F]/g, '');
}
function title(name) { return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function argsText(args) { return (args || []).map(String).filter(Boolean).join(' '); }

function localResult(name, args) {
    const input = argsText(args);
    const games = new Set(['2048','minesweeper','connect4','checkers','chess','wordle','hangman','battleship','memorymatch','sudoku','kakuro','mastermind','blackjack','rpsls','typingrace']);
    const calculators = new Set(['mortgage','loanpayment','tipcalc','vatcalc','billsplit']);
    const tasks = new Set(['todoadd','tododone','todoclear','todolist','habittrack','checklist','grocerylist','kanban']);
    if (name === 'semvercompare') {
        const [a = '0.0.0', b = '0.0.0'] = args;
        const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
        const result = (pa[0] || 0) - (pb[0] || 0) || (pa[1] || 0) - (pb[1] || 0) || (pa[2] || 0) - (pb[2] || 0);
        return '```\\n' + a + ' ' + (result > 0 ? '>' : result < 0 ? '<' : '=') + ' ' + b + '\\n```';
    }
    if (calculators.has(name)) return `Calculator ready. Usage: .${name} <amount> [rate/people/months]`;
    if (tasks.has(name)) return `Local workspace command ready. ${input ? `Item: ${clean(input, 300)}` : 'Provide an item or action.'}`;
    if (games.has(name)) return `🎮 ${title(name)}\\n\\nUse .${name} start to begin. Restart and help controls are available.`;
    return `${title(name)} is ready.\\n\\nInput: ${clean(input || 'none', 500)}\\nUse .${name} help for usage.`;
}

async function executeCommand(name, args, reply) {
    const values = (args || []).map(String).filter(Boolean);
    try {
        const query = encodeURIComponent(argsText(values));
        const api = {
            wikipedia: query ? `https://en.wikipedia.org/api/rest_v1/page/summary/${query}` : null,
            openlibrary: query ? `https://openlibrary.org/search.json?q=${query}&limit=3` : null,
            geocode: query ? `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=${query}` : null,
            reversegeocode: values.length >= 2 ? `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(values[0])}&lon=${encodeURIComponent(values[1])}` : null,
            earthquake: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
            nasaapod: process.env.NASA_API_KEY ? `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(process.env.NASA_API_KEY)}` : null,
        }[name];
        if (api) {
            const data = await fetchJson(api);
            let output = '';
            if (name === 'wikipedia') output = `${data.title || 'Wikipedia'}\\n\\n${data.extract || 'No summary found.'}`;
            else if (name === 'openlibrary') output = (data.docs || []).slice(0, 3).map(item => `${item.title} — ${(item.author_name || [])[0] || 'Unknown'} (${item.first_publish_year || 'n/a'})`).join('\\n');
            else if (name === 'geocode') output = (data || []).map(item => `${item.display_name}\\n${item.lat}, ${item.lon}`).join('\\n\\n');
            else if (name === 'reversegeocode') output = data.display_name || JSON.stringify(data.address || {});
            else if (name === 'earthquake') output = (data.features || []).slice(0, 5).map(item => `M${item.properties?.mag} — ${item.properties?.place}`).join('\\n');
            else if (name === 'nasaapod') output = `${data.title}\\n${data.date}\\n${data.explanation}\\n${data.url}`;
            return reply(`*${title(name)}*\\n\\n${clean(output || 'No results found.')}`);
        }
    } catch (error) {
        return reply(`*${title(name)}*\\n\\nLive data is unavailable right now. Try again shortly.\\n\\nReason: ${clean(error.message, 180)}`);
    }
    return reply(localResult(name, values));
}

function makeCommand({ name, category, description }) {
    return { name, aliases: [], description, category, async execute({ reply, args }) { return executeCommand(name, args, reply); } };
}

module.exports = { makeCommand, fetchJson };

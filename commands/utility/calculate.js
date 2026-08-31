'use strict';

const { sendRichHtml, escapeHtml } = require('../../utils/genaiRich');

const FUNCTIONS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    sqrt: Math.sqrt,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    exp: Math.exp,
    log: Math.log10,
    ln: Math.log,
};

const CONSTANTS = { pi: Math.PI, e: Math.E };

function tokenize(input) {
    const tokens = [];
    let index = 0;
    while (index < input.length) {
        if (/\s/.test(input[index])) {
            index += 1;
            continue;
        }
        const rest = input.slice(index);
        const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
        if (number) {
            const value = Number(number[0]);
            if (!Number.isFinite(value)) throw new Error('Invalid number');
            tokens.push({ type: 'number', value });
            index += number[0].length;
            continue;
        }
        const name = rest.match(/^[a-z]+/i);
        if (name) {
            tokens.push({ type: 'name', value: name[0].toLowerCase() });
            index += name[0].length;
            continue;
        }
        const operator = rest.match(/^(\*\*|[+\-*/%(),])/);
        if (operator) {
            tokens.push({ type: operator[0], value: operator[0] });
            index += operator[0].length;
            continue;
        }
        throw new Error(`Unexpected character at position ${index + 1}`);
    }
    tokens.push({ type: 'eof', value: null });
    return tokens;
}

function evaluateExpression(input) {
    const expression = String(input || '').trim();
    if (!expression || expression.length > 240) throw new Error('Expression is empty or too long');
    const tokens = tokenize(expression);
    let position = 0;
    const peek = () => tokens[position];
    const take = (type) => {
        if (peek().type !== type) throw new Error(`Expected ${type}`);
        return tokens[position++];
    };

    function primary() {
        if (peek().type === 'number') return take('number').value;
        if (peek().type === 'name') {
            const name = take('name').value;
            if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name];
            if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) throw new Error(`Unknown name: ${name}`);
            take('(');
            const argument = addSub();
            take(')');
            const result = FUNCTIONS[name](argument);
            if (!Number.isFinite(result)) throw new Error('Function result is not finite');
            return result;
        }
        if (peek().type === '(') {
            take('(');
            const value = addSub();
            take(')');
            return value;
        }
        throw new Error('Expected a number');
    }

    function unary() {
        if (peek().type === '+') {
            take('+');
            return unary();
        }
        if (peek().type === '-') {
            take('-');
            return -unary();
        }
        return primary();
    }

    function power() {
        const left = unary();
        if (peek().type !== '**') return left;
        take('**');
        const result = left ** power();
        if (!Number.isFinite(result)) throw new Error('Power result is not finite');
        return result;
    }

    function multiply() {
        let value = power();
        while (['*', '/', '%'].includes(peek().type)) {
            const operator = take(peek().type).type;
            const right = power();
            if ((operator === '/' || operator === '%') && right === 0) throw new Error('Division by zero');
            value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
            if (!Number.isFinite(value)) throw new Error('Result is not finite');
        }
        return value;
    }

    function addSub() {
        let value = multiply();
        while (['+', '-'].includes(peek().type)) {
            const operator = take(peek().type).type;
            const right = multiply();
            value = operator === '+' ? value + right : value - right;
            if (!Number.isFinite(value)) throw new Error('Result is not finite');
        }
        return value;
    }

    const result = addSub();
    if (peek().type !== 'eof') throw new Error('Unexpected input after expression');
    if (!Number.isFinite(result)) throw new Error('Result is not finite');
    return result;
}

function formatResult(value) {
    if (Object.is(value, -0)) return '0';
    return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumSignificantDigits: 12 });
}

function calculatorHtml(expression, result, error) {
    const safeExpression = escapeHtml(expression || '');
    const safeResult = escapeHtml(result || '—');
    const safeError = escapeHtml(error || '');
    const status = error ? `<div id="status" class="error">⚠ ${safeError}</div>` : `<div id="status" class="result"><span>ANSWER</span><strong id="answer">${safeResult}</strong></div>`;
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent;font-family:Arial,sans-serif}body{padding:6px;background:radial-gradient(circle at 50% 0%,#073b67,#020812 62%,#01040a)}.card{padding:14px;border:2px solid #26b8ff;border-radius:20px;background:linear-gradient(145deg,#06172d,#071d3e 55%,#020b19);color:#d9f5ff;box-shadow:inset 0 0 0 2px #0d426b,0 0 24px #00aaff66,0 8px 22px #000c}.title{text-align:center;color:#dff8ff;font:bold 21px Arial Black,Arial,sans-serif;letter-spacing:1px;text-shadow:0 0 7px #19cfff,0 0 18px #087bff}.sub{text-align:center;color:#62cfff;margin:3px 0 10px;font:10px monospace;letter-spacing:1px}.rule{height:2px;margin:8px 0;background:linear-gradient(90deg,transparent,#19cfff,#b5f4ff,#19cfff,transparent)}.screen{padding:10px;border:1px solid #12628f;border-radius:12px;background:#020a16;box-shadow:inset 0 0 15px #00385c;color:#98ddff;font:14px monospace;overflow-wrap:anywhere}.screen label{display:block;color:#3c9dca;font-size:9px;letter-spacing:1px;margin-bottom:5px}.result{margin-top:8px;padding:10px;border:1px solid #1ddcff;border-radius:12px;background:linear-gradient(100deg,#052747,#073f67);box-shadow:0 0 14px #00bfff55}.result span{display:block;color:#6ddfff;font:9px monospace;letter-spacing:1px}.result strong{display:block;margin-top:3px;color:#fff;font:bold 25px monospace;text-shadow:0 0 9px #28d8ff;overflow-wrap:anywhere}.error{margin-top:8px;padding:10px;border:1px solid #ff4d88;border-radius:12px;background:#321027;color:#ffb8d2;font:bold 12px monospace}.keys{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}.keys button{height:34px;border:1px solid #168cc2;border-radius:8px;background:linear-gradient(#0b3d66,#061a31);color:#d8f7ff;font:bold 11px monospace;box-shadow:0 0 7px #008cff33}.keys button:active{transform:scale(.95);background:#0c6796}.keys .op{color:#55e7ff;border-color:#20cfff}.help{text-align:center;margin-top:9px;color:#4e9fcb;font:9px monospace}</style></head><body><div class="card"><div class="title">⌁ CYBER CALC ⌁</div><div class="sub">GENAI PRECISION ENGINE · INSTANT ANSWERS</div><div class="rule"></div><div class="screen"><label>EXPRESSION</label><div id="expression">${safeExpression || 'Tap the buttons below to start'}</div>${status}</div><div class="keys"><button data-key="AC" class="clear">AC</button><button data-key="DEL" class="clear">DEL</button><button data-key="(">(</button><button data-key=")">)</button><button data-key="7">7</button><button data-key="8">8</button><button data-key="9">9</button><button data-key="/" class="op">÷</button><button data-key="4">4</button><button data-key="5">5</button><button data-key="6">6</button><button data-key="*" class="op">×</button><button data-key="1">1</button><button data-key="2">2</button><button data-key="3">3</button><button data-key="-" class="op">−</button><button data-key="0">0</button><button data-key=".">.</button><button data-key="%" class="op">%</button><button data-key="+" class="op">+</button><button data-key="=" class="equals">=</button></div><div class="quick"><button data-key="sqrt(">√</button><button data-key="sin(">SIN</button><button data-key="cos(">COS</button><button data-key="tan(">TAN</button><button data-key="pi">π</button><button data-key="**" class="op">xʸ</button></div><div class="help">Tap numbers and operators · AC clears · DEL removes · = calculates</div></div><script>(function(){var expression=${JSON.stringify(expression || '')},expr=document.getElementById('expression'),status=document.getElementById('status');function pretty(value){return value.replace(/\\*/g,'×').replace(/\\//g,'÷').replace(/\\bpi\\b/gi,'π')}function render(){expr.textContent=expression||'Tap the buttons below to start'}function safeEvaluate(input){var i=0;function skip(){while(/\s/.test(input[i]||''))i++}function primary(){skip();if(input[i]==='('){i++;var v=add();skip();if(input[i++]!==')')throw new Error();return v}var m=input.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);if(!m)throw new Error();i+=m[0].length;var v=Number(m[0]);if(!Number.isFinite(v))throw new Error();return v}function unary(){skip();if(input[i]==='+'){i++;return unary()}if(input[i]==='-'){i++;return -unary()}return primary()}function power(){var v=unary();skip();if(input.slice(i,i+2)==='**'){i+=2;v=v**power()}return v}function multiply(){var v=power();for(;;){skip();var op=input[i];if(!['*','/','%'].includes(op))return v;i++;var r=power();if((op==='/'||op==='%')&&r===0)throw new Error();v=op==='*'?v*r:op==='/'?v/r:v%r;if(!Number.isFinite(v))throw new Error()}}function add(){var v=multiply();for(;;){skip();var op=input[i];if(op!=='+'&&op!=='-')return v;i++;var r=multiply();v=op==='+'?v+r:v-r;if(!Number.isFinite(v))throw new Error()}}var value=add();skip();if(i!==input.length||!Number.isFinite(value))throw new Error();return value}function calculate(){if(!expression)return;try{if(!/^[0-9+\\-*/%(). a-z]+$/i.test(expression))throw new Error();var source=expression.replace(/\\bpi\\b/gi,String(Math.PI)).replace(/\\bsqrt\\(/gi,'Math.sqrt(').replace(/\\bsin\\(/gi,'Math.sin(').replace(/\\bcos\\(/gi,'Math.cos(').replace(/\\btan\\(/gi,'Math.tan(');if(/[a-z]/i.test(source))throw new Error();var value=safeEvaluate(source);if(!Number.isFinite(value))throw new Error();status.className='result';status.innerHTML='<span>ANSWER</span><strong id="answer">'+(Number.isInteger(value)?value.toLocaleString('en-US'):value.toLocaleString('en-US',{maximumSignificantDigits:12}))+'</strong>'}catch(_){status.className='error';status.textContent='⚠ Finish the expression or tap AC'}render()}document.querySelectorAll('[data-key]').forEach(function(button){button.addEventListener('click',function(){var key=button.getAttribute('data-key');if(key==='AC'){expression='';status.className='result';status.innerHTML='<span>ANSWER</span><strong id="answer">—</strong>'}else if(key==='DEL'){expression=expression.slice(0,-1)}else if(key==='='){calculate();return}else{expression+=key}render()})});render();if(expression)calculate()})();</script></body></html>`;
}

module.exports = {
    name: 'calc',
    aliases: ['calculate', 'math'],
    description: 'Calculate mathematical expressions with a cyber-neon GenAI card',
    category: 'utility',
    evaluateExpression,
    formatResult,
    async execute({ sock, msg, from, reply, args }) {
        const expression = args.join(' ').trim();
        if (!expression) {
            return sendRichHtml({ sock, jid: from, quoted: msg, html: calculatorHtml('', '—', 'Usage: .calc 12 * (8 + 2) or .calc sqrt(144) + 5') })
                .catch(() => reply('🔢 Calculator\n\nUsage: .calc <expression>\nExample: .calc 12 * (8 + 2)'));
        }
        try {
            const result = formatResult(evaluateExpression(expression));
            await sendRichHtml({ sock, jid: from, quoted: msg, html: calculatorHtml(expression, result, '') });
        } catch (error) {
            const message = error.message === 'Division by zero' ? 'Division by zero is not allowed.' : 'Invalid expression. Try numbers, + − × ÷ %, **, parentheses, or functions such as sqrt(144).';
            try {
                await sendRichHtml({ sock, jid: from, quoted: msg, html: calculatorHtml(expression, '', message) });
            } catch (_) {
                await reply(`❌ ${message}`);
            }
        }
    },
};

module.exports.calculatorHtml = calculatorHtml;
module.exports.tokenize = tokenize;

const commandLoader = require('../../utils/commandLoader');

module.exports = {
    name: 'textmaker',
    aliases: ['texteffects', 'texteffect'],
    description: 'List all available textmaker effects',
    category: 'textmaker',
    async execute({ reply }) {
        const commands = commandLoader.getAll()
            .filter(command => command.category === 'textmaker' && command.name !== 'textmaker')
            .map(command => command.name)
            .sort();
        if (!commands.length) {
            return reply('❌ No textmaker effects are currently loaded.');
        }
        return reply(
            `╭━━━ TEXTMAKER EFFECTS ━━━╮\n│ ${commands.map(name => `▸ .${name}`).join('\n│ ')}\n╰━━━ ${commands.length} effects ━━━╯`
        );
    },
};

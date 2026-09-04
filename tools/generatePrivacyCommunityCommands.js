'use strict';

const fs = require('fs');
const path = require('path');

const owner = path.join(__dirname, '..', 'commands', 'owner');
const privacy = {
    lastseen: 'Last-seen privacy',
    setonline: 'Online privacy',
    pfpprivacy: 'Profile-photo privacy',
    statusprivacy: 'Status privacy',
    groupprivacy: 'Group-add privacy',
    callsprivacy: 'Calls privacy',
    readreceipts: 'Read receipts',
    disappearing: 'Default disappearing messages',
    myprivacy: 'View privacy settings',
};
for (const [name, title] of Object.entries(privacy)) {
    const args = name === 'readreceipts' ? "['readreceipts', ...context.args]" : name === 'myprivacy' ? "['myprivacy']" : name === 'disappearing' ? "['disappearing', ...context.args]" : "['${name}', ...context.args]";
    fs.writeFileSync(path.join(owner, `${name}.js`), `'use strict';\n\nconst privacy = require('./privacy');\n\nmodule.exports = {\n    name: '${name}',\n    description: '${title}',\n    category: 'owner',\n    ownerOnly: true,\n    async execute(context) {\n        return privacy.execute({ ...context, args: ${args} });\n    },\n};\n`);
}

const community = {
    createcommunity: 'Create a WhatsApp community',
    leavecommunity: 'Leave a WhatsApp community',
    communitygroup: 'Create a group inside a community',
    communityname: 'Rename a community',
    linkgroup: 'Link a group to a community',
    unlinkgroup: 'Unlink a group from a community',
    linkedgroups: 'List linked community groups',
    mycommunities: 'List participating communities',
    communityinfo: 'Show community metadata',
    addtocommunity: 'Add a participant to a community',
    removefromcommunity: 'Remove a participant from a community',
    communityadmin: 'Promote a community participant',
    communitydemote: 'Demote a community participant',
};
for (const [name, title] of Object.entries(community)) {
    fs.writeFileSync(path.join(owner, `${name}.js`), `'use strict';\n\nconst { executeCommunity } = require('../../utils/communityCommandFactory');\n\nmodule.exports = {\n    name: '${name}',\n    description: '${title}',\n    category: 'owner',\n    ownerOnly: true,\n    async execute(context) {\n        return executeCommunity({ ...context, name: '${name}' });\n    },\n};\n`);
}
console.log(`Generated ${Object.keys(privacy).length} privacy and ${Object.keys(community).length} community commands.`);

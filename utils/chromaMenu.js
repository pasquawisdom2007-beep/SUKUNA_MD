'use strict';

const crypto = require('crypto');
const { generateWAMessageFromContent, proto } = require('@pasqua-baileys/baileys');

const MENU_IMAGE_URL = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663936678738/YSmNKRleqLdoBHTu.png';
const CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCJho147XeEEuR1LA3s';

const MENU_COLUMNS = [
    { title: 'Menu1', buttons: ['menu2', 'menu3', 'rich3'], commands: ['menu', 'cmdlist', 'ttt'] },
    { title: 'Menu2', buttons: ['test', 'me', 'rich2'], commands: ['ping', 'profile', 'snake'] },
];

function actionRow(title, labels, commands, prefix) {
    return {
        __typename: 'GenAI3PExtWidgetPrimitive',
        header: {
            __typename: 'GenAI3PExtWidgetStandardHeader',
            title,
        },
        body: {
            __typename: 'GenAI3PExtCalendarEventList',
            ctas: labels.map((label, index) => ({
                label,
                state: 'PENDING',
                kind: 'OTHER',
                tool_call_id: `${prefix}${commands[index]}`,
                toast: {
                    label: `Opening ${prefix}${commands[index]}`,
                    __typename: 'GenAI3PExtWidgetToast',
                },
                __typename: 'GenAI3PExtWidgetCTA',
            })),
            sections: [],
        },
    };
}

function buildRichMenuData({ prefix = '.', imageUrl = MENU_IMAGE_URL, channelUrl = CHANNEL_URL } = {}) {
    const sections = [
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: { __typename: 'FOATextPrimitive', text: '# Rich Menu' },
            },
        },
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAISingleLayoutViewModel',
                primitive: {
                    __typename: 'GenAIImagePrimitive',
                    preview_image: { __typename: 'GenAIMediaItem', mime_type: 'image/png', url: imageUrl },
                    full_image: { __typename: 'GenAIMediaItem', mime_type: 'image/png', url: imageUrl },
                },
            },
        },
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAIActionRowLayoutViewModel',
                primitives: MENU_COLUMNS.map(column => actionRow(column.title, column.buttons, column.commands, prefix)),
            },
        },
        {
            __typename: 'GenAIUnifiedResponseSection',
            view_model: {
                __typename: 'GenAIActionRowLayoutViewModel',
                primitives: [{
                    cta_text: 'Telegram channel',
                    cta_type: 'OPEN_URL',
                    cta_url: channelUrl,
                    __typename: 'GenAIFooterActionPrimitive',
                }, {
                    __typename: 'GenAIMarkdownTextUXPrimitive',
                    text: '{{header}}.{{/header}}',
                    inline_entities: [{
                        __typename: 'GenAITextInlineEntity',
                        key: 'header',
                        metadata: {
                            __typename: 'GenAILatexItem',
                            latex_expression: '.',
                            font_height: 24,
                            padding: -5,
                            latex_image: {
                                __typename: 'GenAIMediaItem',
                                mime_type: 'image/png',
                                url: imageUrl,
                                url_fallback: imageUrl,
                                width: 100,
                                height: 100,
                                expiration_timestamp_ms: Date.now() + 86400000,
                            },
                        },
                    }],
                }],
            },
        },
    ];

    return { sections };
}

function buildChromaContent(options = {}) {
    const data = Buffer.from(JSON.stringify(buildRichMenuData(options))).toString('base64');
    return proto.Message.fromObject({
        messageContextInfo: {
            deviceListMetadataVersion: 2,
            deviceListMetadata: {},
            messageSecret: crypto.randomBytes(32),
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [],
                    unifiedResponse: { data },
                    contextInfo: {
                        isForwarded: true,
                        forwardingScore: 1,
                        forwardOrigin: 4,
                    },
                },
            },
        },
    });
}

async function sendChromaMenu({ sock, jid, prefix = '.', quoted }) {
    const content = buildChromaContent({ prefix });
    const wrapped = generateWAMessageFromContent(jid, content, {
        userJid: sock.user?.id,
        quoted: quoted?.message ? quoted : undefined,
    });
    await sock.relayMessage(jid, wrapped.message, { messageId: wrapped.key.id });
    return wrapped;
}

module.exports = { sendChromaMenu, buildChromaContent, buildRichMenuData, MENU_COLUMNS, MENU_IMAGE_URL, CHANNEL_URL };

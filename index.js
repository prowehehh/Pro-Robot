const { 
    Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    UserSelectMenuBuilder, ContextMenuCommandBuilder, ApplicationCommandType,
    StringSelectMenuBuilder, PermissionFlagsBits
} = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

// ============================================================
// --- [DATABASE] MongoDB Connection & Schema ---
// ============================================================
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Pro-Robot Database: Connection Successful'))
    .catch(err => console.error('❌ Pro-Robot Database: Connection Error', err));

const serverSchema = new mongoose.Schema({
    guildId: String,
    cmdPermissions: { type: Map, of: String, default: {} },
    userWarns: { type: Map, of: Number, default: {} }
});

const ServerModel = mongoose.model('ServerData', serverSchema);

async function getDB(guildId) {
    let data = await ServerModel.findOne({ guildId });
    if (!data) data = await ServerModel.create({ guildId });
    return data;
}

app.get('/', (req, res) => res.send('Pro Robot is Online! 🤖'));
app.listen(5000, '0.0.0.0');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    presence: {
        status: 'online',
        activities: [{
            name: 'Custom Status',
            state: '🤖 | Version: 5.0',
            type: 4
        }]
    }
});

const CONFIG = {
    WELCOME_CH:  '1482881348204101768',
    AUTO_ROLE:   '1482883802186514615',
    AUTO_ROLE_2: '1499510435639197887',
    OWNER_ID:    '1134146616857731173',
    BOT_ID:      '1495419259147386920',
    HELP_CH:     '1497909981725593712',
    SUBMIT_LOG:  '1494367980702797935',
    ROLE_CHANNEL:'148274761951576228',
    INFO_CH:     '1484641160394702958',
    DM_LOG_CH:   '1502084414421729340'
};

// ============================================================
// --- In-Memory Storage ---
// ============================================================
const adsStorage        = new Map();
const warnStorage       = new Map();
const dmAdsStorage      = new Map();
const dmSettingsStorage = new Map();
const formSettingsDB    = new Map();
const pendingUpdates    = new Map();
const chatMemory        = new Map();
const clearSessionStore = new Map();   // stores pending /clear sessions
const roleSessionStore  = new Map();   // stores pending /role sessions

const ADMIN_PASSWORD = "Pro@Robot510";
let   extraServerInfo = "";

// ============================================================
// --- [SECURITY] Protection System ---
// ============================================================
const spamTracker = new Map();
const raidTracker = new Map();
const SPAM_LIMIT         = 5;
const SPAM_WINDOW        = 5000;
const RAID_THRESHOLD     = 8;
const RAID_WINDOW        = 10000;
const NEW_ACCOUNT_DAYS   = 7;
const MIN_ACCOUNT_MS     = NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;

const protectionSettings = new Map([
    ['antiSpam',             true],
    ['antiRaid',             true],
    ['antiLink',             true],
    ['antiCaps',             true],
    ['antiMassMention',      true],
    ['antiBadWord',          true],
    ['newAccountProtection', true],
    ['sync',                 true]
]);

// ============================================================
// --- [SYNC] Action Logger ---
// ============================================================
const syncLog = [];

function recordSync(action, details) {
    syncLog.push({ timestamp: new Date().toISOString(), action, details });
    if (syncLog.length > 100) syncLog.shift();
}

// ============================================================
// --- [DM LOGGER] ---
// ============================================================
async function logDMActivity(userId, username, content, type = 'IN_TEXT', extraData = {}) {
    const logCh = client.channels.cache.get(CONFIG.DM_LOG_CH);
    if (!logCh) return;
    let logEmbed;
    if (type === 'IN_TEXT') {
        logEmbed = new EmbedBuilder()
            .setTitle('📥 Incoming Private Message')
            .addFields(
                { name: 'Sender',          value: `<@${userId}>`,       inline: true },
                { name: 'User ID',         value: `${userId}`,          inline: true },
                { name: 'Message Content', value: content || '[Empty]', inline: false }
            )
            .setColor('#f1c40f').setTimestamp();
    } else if (type === 'IN_MEDIA') {
        logEmbed = new EmbedBuilder()
            .setTitle('🖼️ Private Media Detected')
            .addFields(
                { name: 'Sender', value: `<@${userId}>`,              inline: true },
                { name: 'Status', value: 'Attachment Received',       inline: true },
                { name: 'Note',   value: '(Image displayed below)',   inline: false }
            )
            .setColor('#e67e22').setTimestamp();
        if (extraData.imageUrl) logEmbed.setImage(extraData.imageUrl);
    } else if (type === 'AI_RESPONSE') {
        logEmbed = new EmbedBuilder()
            .setTitle('🤖 AI Automatic Response')
            .addFields(
                { name: 'Target User', value: `<@${userId}>`,  inline: true },
                { name: 'AI Response', value: content || '[Empty]', inline: false }
            )
            .setColor('#3498db').setTimestamp();
    } else if (type === 'ALERT') {
        logEmbed = new EmbedBuilder()
            .setTitle('⚠️ DM System Alert')
            .addFields(
                { name: 'User',     value: `<@${userId}>`, inline: true },
                { name: 'Activity', value: content || 'Multiple messages detected.', inline: false }
            )
            .setColor('#e74c3c').setTimestamp();
    } else {
        logEmbed = new EmbedBuilder()
            .setTitle('📤 DM Sent (Bot → User)')
            .addFields(
                { name: 'Target',  value: `<@${userId}>`, inline: true },
                { name: 'Content', value: content || '[Empty]', inline: false }
            )
            .setColor('#2ecc71').setTimestamp();
    }
    await logCh.send({ embeds: [logEmbed] }).catch(() => {});
}

// ============================================================
// --- [MOD DM] Send Moderation Notification ---
// ============================================================
async function sendModDM(user, action, reason, guildName) {
    try {
        const dmChannel = await user.createDM();
        const modEmbed = new EmbedBuilder()
            .setTitle(`⚠️ Action Taken — ${guildName}`)
            .setDescription(`You have received a moderation action in **${guildName}**.`)
            .addFields(
                { name: '🔨 Action', value: `**${action}**`,                  inline: true },
                { name: '📝 Reason', value: reason || 'No reason provided.', inline: true }
            )
            .setColor('#e74c3c').setTimestamp()
            .setFooter({ text: 'Pro Robot Security System • Pro Server' });
        await dmChannel.send({ embeds: [modEmbed] });
        await logDMActivity(user.id, user.tag, `[MOD NOTIFICATION] Action: ${action} | Reason: ${reason}`, 'OUT');
    } catch (err) {
        console.error(`❌ Failed to send mod DM to ${user.tag}:`, err);
    }
}

// ============================================================
// --- [AI] Gemini Brain ---
// ============================================================
async function getEliteAIResponse(userId, userMessage, guild) {
    const memberCount = guild.memberCount;
    const serverName  = guild.name;
    const owner       = guild.members.cache.get(CONFIG.OWNER_ID)?.user.username || "Saif";

    if (!chatMemory.has(userId)) chatMemory.set(userId, []);
    let memory = chatMemory.get(userId);

    const systemPrompt = `You are "Pro Robot", the all-knowing AI assistant and Executive Manager of the Discord server "${serverName}".

IDENTITY:
- You are not a simple bot. You are a highly advanced AI with deep knowledge across ALL fields: science, technology, history, math, gaming, sports, culture, religion, medicine, law, programming, and more.
- You act as a trusted co-owner of this server alongside ${owner} (<@${CONFIG.OWNER_ID}>).
- Server has ${memberCount} members under your supervision. Location: Egypt.

KNOWLEDGE & ANSWERS:
- You MUST answer EVERY question asked, no matter the topic, with FULL detail, accuracy, and depth.
- NEVER say "I don't know" or refuse to answer general knowledge questions. Always provide a thorough, well-structured response.
- For complex topics, break your answer into clear sections or bullet points.
- Include examples, explanations, and context whenever helpful.
- If a question has multiple parts, answer each part clearly.

LANGUAGES:
- You are a polyglot. Detect the user's language and respond in the EXACT same language.
- If the user writes in Arabic (Egyptian dialect or formal), respond in Arabic.
- If the user writes in English, respond in English.
- Never mix languages unless the user does so first.

MEMORY:
- You remember the full conversation history. Use it to give continuous, connected answers.
- Reference previous messages when relevant to show you're paying attention.

SPECIAL RULE:
- If the user asks to change, add, or update any server setting or info, respond with: "لمعالجة هذا الطلب، يرجى الضغط على الزر أدناه وإدخال كلمة المرور." (or in English if they asked in English).`;

    memory.push({ role: "user", parts: [{ text: userMessage }] });
    if (memory.length > 20) memory.splice(0, 2);

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: memory,
                    generationConfig: { temperature: 0.8, maxOutputTokens: 2000 }
                })
            }
        );
        const data     = await response.json();
        const aiReply  = data.candidates?.[0]?.content?.parts?.[0]?.text
            || `Pro Robot AI is unavailable. Please contact the owner <@${CONFIG.OWNER_ID}>`;
        memory.push({ role: "model", parts: [{ text: aiReply }] });
        chatMemory.set(userId, memory);
        return aiReply;
    } catch (error) {
        console.error("AI System Error:", error);
        return `AI connection error. Please try again. <@${CONFIG.OWNER_ID}>`;
    }
}

// ============================================================
// --- [LOGGING] Server Audit Log ---
// ============================================================
async function sendDetailedLog(guild, title, details, color = '#3498db') {
    const logChannel = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
    if (!logChannel) return;
    setTimeout(async () => {
        const fetchedLogs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
        const logEntry    = fetchedLogs?.entries.first();
        const executor    = logEntry ? `<@${logEntry.executor.id}>` : "System / Unknown";
        const logEmbed    = new EmbedBuilder()
            .setTitle(`📡 RADAR: ${title}`)
            .setDescription(details)
            .addFields(
                { name: '👤 Executor:', value: `**${executor}**`, inline: true },
                { name: '📍 Location:', value: guild.name,        inline: true }
            )
            .setColor(color).setTimestamp();
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }, 2000);
}

const BAD_WORDS          = ['word1', 'word2', 'word3'];
const inviteLinkRegex    = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/.+[a-z]/gi;
const generalLinkRegex   = /(https?:\/\/[^\s]+)/gi;

// ============================================================
// --- [DM SMART SEND] ---
// ============================================================
const buildDMPayloadGlobal = (userId, settings) => {
    const { style, msgContent, caption, imageUrl, color, showDeleteButton } = settings;
    const components = [];
    if (showDeleteButton) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`delete_dm_${userId}`)
                .setLabel('Delete Message 🗑️')
                .setStyle(ButtonStyle.Danger)
        ));
    }
    if (style === 'embed') {
        const embed = new EmbedBuilder().setColor(color || '#3498db').setTimestamp();
        if (msgContent) embed.setDescription(msgContent);
        if (caption)    embed.setTitle(caption);
        if (imageUrl)   embed.setImage(imageUrl);
        return { embeds: [embed], components };
    } else {
        const payload = {
            content: [msgContent, caption].filter(Boolean).join('\n') || ' ',
            components
        };
        if (imageUrl) payload.files = [imageUrl];
        return payload;
    }
};

const executeSmartSend = async (user, initiator, settings) => {
    try {
        const dmChannel = await user.createDM();
        const payload   = buildDMPayloadGlobal(user.id, settings);
        const sent      = await dmChannel.send(payload);
        const msgLink   = `https://discord.com/channels/@me/${sent.channelId}/${sent.id}`;
        const logCh     = client.channels.cache.get(CONFIG.DM_LOG_CH);
        if (logCh) {
            await logCh.send({
                embeds: [new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('🔗 DM Tracking Link')
                    .setDescription(`**Sent to:** ${user.username}\n\n${msgLink}`)
                    .setTimestamp()]
            }).catch(() => {});
        }
        if (settings.reactionEmoji) await sent.react(settings.reactionEmoji).catch(() => {});
        await logDMActivity(user.id, user.tag, settings.msgContent || settings.caption || '[Image Only]', 'AI_RESPONSE');
        if (settings.delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), settings.delAfter * 60000);
        return true;
    } catch (e) {
        console.error(`❌ executeSmartSend failed for ${user.username}:`, e);
        return false;
    }
};

// ============================================================
// --- [COMMANDS] Slash Command Definitions ---
// ============================================================
const commands = [

    // ─── OWNER / ADMIN ONLY ─────────────────────────────────

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(true),

    // ── /clear redesigned with user selector ─────────────────
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete messages in this channel')
        .addIntegerOption(o =>
            o.setName('amount')
             .setDescription('Number of messages to scan (max 100)')
             .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('target')
             .setDescription('Who to clear messages from')
             .setRequired(true)
             .addChoices(
                 { name: '🌐 Everyone  — delete all messages', value: 'everyone' },
                 { name: '☑️ Select Users — pick specific members', value: 'select' }
             )
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('send')
        .setDescription('Send a custom message with a timer')
        .addStringOption(o => o.setName('message').setDescription('Message content').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Message style').setRequired(true)
            .addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal', value: 'normal' }))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Wait before sending (minutes)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Auto-delete after (minutes)').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Box color')
            .addChoices({ name: 'Blue', value: '#3498db' }, { name: 'Red', value: '#e74c3c' }, { name: 'Green', value: '#2ecc71' }))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('ads_set')
        .setDescription('Create a new auto-advertisement')
        .addStringOption(o => o.setName('name').setDescription('Ad name').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Ad content').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('Post every X minutes').setRequired(true))
        .addIntegerOption(o => o.setName('delete').setDescription('Delete after X minutes').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Style').setRequired(true)
            .addChoices({ name: 'Box', value: 'embed' }, { name: 'Normal', value: 'normal' }))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('ads_edit')
        .setDescription('Edit or delete an existing ad')
        .addStringOption(o => o.setName('name').setDescription('Ad name').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('text').setDescription('New text').setRequired(false))
        .addChannelOption(o => o.setName('channel').setDescription('New channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addIntegerOption(o => o.setName('interval').setDescription('New interval').setRequired(false))
        .addIntegerOption(o => o.setName('delete').setDescription('New delete time').setRequired(false))
        .addStringOption(o => o.setName('style').setDescription('New style').setRequired(false)
            .addChoices({ name: 'Box', value: 'embed' }, { name: 'Normal', value: 'normal' }))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Create a quick vote')
        .addStringOption(o => o.setName('question').setDescription('Vote question').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    // ── /role redesigned with user selector ──────────────────
    new SlashCommandBuilder()
        .setName('role')
        .setDescription('Give a role to one or more members')
        .addRoleOption(o => o.setName('rank').setDescription('The role to assign').setRequired(true))
        .addStringOption(o =>
            o.setName('target')
             .setDescription('Who to give the role to')
             .setRequired(true)
             .addChoices(
                 { name: '☑️ Select Users — pick specific members', value: 'select'  },
                 { name: '🌐 Everyone  — give role to all',          value: 'everyone' }
             )
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('slash_control')
        .setDescription('Restrict a command to a specific role')
        .addStringOption(o => o.setName('command_name').setDescription('Command to restrict').setRequired(true))
        .addRoleOption(o => o.setName('allowed_role').setDescription('Role allowed to use it').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('reaction')
        .setDescription('Manage reactions on messages')
        .addSubcommand(sub =>
            sub.setName('add')
               .setDescription('Add a reaction to a message')
               .addStringOption(o => o.setName('link').setDescription('Message link').setRequired(true))
               .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
               .setDescription('Remove a reaction from a message')
               .addStringOption(o => o.setName('message_link').setDescription('Message link').setRequired(true))
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('picture')
        .setDescription('Send an image with auto-send and auto-delete timers')
        .addAttachmentOption(o => o.setName('image').setDescription('Image to send').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Style').setRequired(true)
            .addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal', value: 'normal' }))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Wait before sending (minutes)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Delete after (minutes)').setRequired(true))
        .addStringOption(o => o.setName('caption').setDescription('Caption text').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    // ── /dm redesigned with unified select UI ────────────────
    new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send DMs to members')
        .addStringOption(o => o.setName('style').setDescription('Message style').setRequired(true)
            .addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal', value: 'normal' }))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Wait before sending (minutes, 0 = instant)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Auto-delete after (minutes, 0 = never)').setRequired(true))
        .addStringOption(o =>
            o.setName('target')
             .setDescription('Who to send the DM to')
             .setRequired(true)
             .addChoices(
                 { name: '☑️ Select Users — pick specific members', value: 'select'       },
                 { name: '🌐 Everyone  — send to all members',      value: 'everyone'     },
                 { name: '🚫 Everyone Except — choose exclusions',  value: 'everyone_exc' }
             )
        )
        .addStringOption(o => o.setName('message').setDescription('Message text').setRequired(false))
        .addAttachmentOption(o => o.setName('image').setDescription('Image to send').setRequired(false))
        .addStringOption(o => o.setName('caption').setDescription('Caption for the image').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('Embed color')
            .addChoices(
                { name: 'Blue',  value: '#3498db' }, { name: 'Red',  value: '#e74c3c' },
                { name: 'Green', value: '#2ecc71' }, { name: 'Gold', value: '#f1c40f' }
            ).setRequired(false))
        .addIntegerOption(o => o.setName('repeat_interval').setDescription('Repeat every X minutes (0 = no repeat)').setRequired(false))
        .addStringOption(o => o.setName('reaction').setDescription('Auto-react emoji on DM').setRequired(false))
        .addBooleanOption(o => o.setName('delete_button').setDescription('Show delete button to recipient').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(true),

    new SlashCommandBuilder()
        .setName('edit')
        .setDescription('Edit a previously sent bot message')
        .addStringOption(o => o.setName('message_link').setDescription('Full message link').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete a message using its link')
        .addStringOption(o => o.setName('message_link').setDescription('Message link').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('server-status')
        .setDescription('Get a full private status report of the server')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(true),

    new SlashCommandBuilder()
        .setName('setup-form')
        .setDescription('Create a custom form with a button')
        .addStringOption(o => o.setName('message_text').setDescription('Text above the button').setRequired(true))
        .addBooleanOption(o => o.setName('is_box').setDescription('Send as Embed?').setRequired(true))
        .addStringOption(o => o.setName('btn_name').setDescription('Button label').setRequired(true))
        .addStringOption(o => o.setName('btn_color').setDescription('Button color').setRequired(true)
            .addChoices(
                { name: 'Blue',  value: 'Primary'   }, { name: 'Green', value: 'Success'   },
                { name: 'Red',   value: 'Danger'    }, { name: 'Grey',  value: 'Secondary' }
            ))
        .addChannelOption(o => o.setName('target_channel').setDescription('Where results are sent').setRequired(true))
        .addStringOption(o => o.setName('field_1_name').setDescription('Field 1 label').setRequired(true))
        .addBooleanOption(o => o.setName('result_is_box').setDescription('Send result as Embed?').setRequired(true))
        .addStringOption(o => o.setName('field_2_name').setDescription('Field 2 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('field_3_name').setDescription('Field 3 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('field_4_name').setDescription('Field 4 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('field_5_name').setDescription('Field 5 label (optional)').setRequired(false))
        .addBooleanOption(o => o.setName('send_to_dm').setDescription('Send button via DM?').setRequired(false))
        .addUserOption(o => o.setName('dm_user').setDescription('User to send DM to').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('Lock or unlock all server channels')
        .addStringOption(o => o.setName('action').setDescription('lock or unlock').setRequired(true)
            .addChoices({ name: '🔒 Lock All', value: 'lock' }, { name: '🔓 Unlock All', value: 'unlock' }))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('security-status')
        .setDescription('View the status of all protection systems')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(true),

    new SlashCommandBuilder()
        .setName('security')
        .setDescription('Enable or disable a specific protection system')
        .addStringOption(o =>
            o.setName('protection')
             .setDescription('Which protection to toggle')
             .setRequired(true)
             .addChoices(
                 { name: '🛡️ Anti-Spam',              value: 'antiSpam'             },
                 { name: '🚨 Anti-Raid',              value: 'antiRaid'             },
                 { name: '🔗 Anti-Link',              value: 'antiLink'             },
                 { name: '🔤 Anti-Caps',              value: 'antiCaps'             },
                 { name: '📢 Anti-Mass-Mention',      value: 'antiMassMention'      },
                 { name: '🤬 Anti-Bad-Word',          value: 'antiBadWord'          },
                 { name: '👶 New Account Protection', value: 'newAccountProtection' },
                 { name: '🔄 Sync System',            value: 'sync'                }
             )
        )
        .addStringOption(o =>
            o.setName('status')
             .setDescription('Enable or disable')
             .setRequired(true)
             .addChoices(
                 { name: '✅ Enable',  value: 'enable'  },
                 { name: '❌ Disable', value: 'disable' }
             )
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(true),

    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Sync the bot — catch up missed actions')
        .addStringOption(o =>
            o.setName('action')
             .setDescription('What to do')
             .setRequired(true)
             .addChoices(
                 { name: '🔄 Run Sync Now',  value: 'run'     },
                 { name: '📋 View Sync Log', value: 'log'     },
                 { name: '✅ Enable Sync',   value: 'enable'  },
                 { name: '❌ Disable Sync',  value: 'disable' }
             )
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(true),

    // ─── PUBLIC COMMANDS ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate text to any language')
        .addStringOption(o => o.setName('text').setDescription('Text to translate').setRequired(true))
        .addStringOption(o => o.setName('to').setDescription('Target language code (e.g: ar, en, fr)').setRequired(true))
        .setDMPermission(true),

    new SlashCommandBuilder()
        .setName('appeal')
        .setDescription('Submit an appeal for a ban, kick, or mute')
        .setDMPermission(true),

    // ─── CONTEXT MENUS (Apps) ────────────────────────────────

    new ContextMenuCommandBuilder()
        .setName('Delete Message')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    new ContextMenuCommandBuilder()
        .setName('Edit Message')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    new ContextMenuCommandBuilder()
        .setName('Add Reaction')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    new ContextMenuCommandBuilder()
        .setName('Remove Reaction')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    new ContextMenuCommandBuilder()
        .setName('Translate Message')
        .setType(ApplicationCommandType.Message),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// ============================================================
// --- [AD LOOPS] ---
// ============================================================
function startAdLoop(adName, guildId) {
    const ad = adsStorage.get(adName);
    if (!ad) return;
    if (ad.timer) clearInterval(ad.timer);
    ad.timer = setInterval(async () => {
        const guild = client.guilds.cache.get(guildId);
        const chan   = guild?.channels.cache.get(ad.channelId);
        if (!chan) return;
        if (ad.lastMsgId) {
            const old = await chan.messages.fetch(ad.lastMsgId).catch(() => null);
            if (old) await old.delete().catch(() => {});
        }
        let sent;
        if (ad.style === 'embed') {
            sent = await chan.send({ embeds: [new EmbedBuilder().setDescription(ad.text).setColor('#3498db').setTitle(`📢 ${ad.name}`)] }).catch(() => {});
        } else {
            sent = await chan.send(`**📢 ${ad.name}**\n\n${ad.text}`).catch(() => {});
        }
        if (sent) {
            ad.lastMsgId = sent.id;
            if (ad.deleteAfter > 0) setTimeout(() => sent.delete().catch(() => {}), ad.deleteAfter * 60000);
        }
    }, ad.interval * 60000);
}

function startDMAdsLoop(adName, guildId) {
    const ad = dmAdsStorage.get(adName);
    if (!ad) return;
    if (ad.timer) clearInterval(ad.timer);
    ad.timer = setInterval(async () => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const buildPayload = (userId) => {
            const deleteRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`delete_dm_${userId}`)
                    .setLabel('Delete Message 🗑️')
                    .setStyle(ButtonStyle.Danger)
            );
            if (ad.style === 'embed') {
                const embed = new EmbedBuilder().setColor(ad.color || '#3498db').setTimestamp();
                if (ad.msgContent) embed.setDescription(ad.msgContent);
                if (ad.caption)    embed.setTitle(ad.caption);
                if (ad.imageUrl)   embed.setImage(ad.imageUrl);
                return { embeds: [embed], components: [deleteRow] };
            } else {
                const payload = { content: ad.msgContent || ad.caption || ' ', components: [deleteRow] };
                if (ad.imageUrl) payload.files = [ad.imageUrl];
                return payload;
            }
        };

        const sendOne = async (user) => {
            try {
                const dm      = await user.createDM();
                const payload = buildPayload(user.id);
                const sent    = await dm.send(payload);
                if (ad.reactionEmoji) await sent.react(ad.reactionEmoji).catch(() => {});
                await logDMActivity(user.id, user.tag, ad.msgContent || '[Image]', 'AI_RESPONSE');
                if (ad.deleteAfter > 0) setTimeout(() => sent.delete().catch(() => {}), ad.deleteAfter * 60000);
            } catch (e) {
                console.error(`❌ DM Ad failed for ${user.tag}:`, e);
            }
        };

        if (ad.targetUserId === 'everyone') {
            const members = await guild.members.fetch().catch(() => null);
            if (!members) return;
            for (const [, member] of members) {
                if (!member.user.bot) {
                    await sendOne(member.user);
                    await new Promise(r => setTimeout(r, 1200));
                }
            }
        } else {
            const user = await client.users.fetch(ad.targetUserId).catch(() => null);
            if (user) await sendOne(user);
        }
    }, ad.interval * 60000);
}

// ============================================================
// --- [MONITORING] Guild Events ---
// ============================================================
client.on('guildUpdate', (oldGuild, newGuild) => {
    if (oldGuild.name !== newGuild.name)
        sendDetailedLog(newGuild, 'Server Name Changed', `From **${oldGuild.name}** to **${newGuild.name}**`, '#e67e22');
    if (oldGuild.icon !== newGuild.icon)
        sendDetailedLog(newGuild, 'Server Icon Changed', 'Server avatar has been updated.', '#9b59b6');
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const BOOST_ROLE_ID    = '1496789784524357703';
        const BOOST_CHANNEL_ID = '1482934834899714048';
        try { await newMember.roles.add(BOOST_ROLE_ID); } catch (err) { console.error(err); }
        const boostChannel = newMember.guild.channels.cache.get(BOOST_CHANNEL_ID);
        if (boostChannel) {
            const boostMsg = await boostChannel.send({
                content: `@everyone\n<@${newMember.id}> Boosted the server! 🎉\n- Now <@${newMember.id}> has <@&${BOOST_ROLE_ID}> rank!`
            });
            if (boostMsg) await boostMsg.react('🎉').catch(() => {});
        }
        await sendModDM(newMember.user, '💎 Server Boost Reward',
            `Thank you for boosting **${newMember.guild.name}**! Your boost role has been assigned. We truly appreciate your support! 🎉`,
            newMember.guild.name);
        sendDetailedLog(newMember.guild, 'Server Boosted! 💎',
            `User: <@${newMember.id}> has just boosted the server.\nStatus: **Role Assigned Successfully**`, '#ffff55');
    }

    const wasTimedOut = !oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil;
    if (wasTimedOut) {
        const until    = newMember.communicationDisabledUntil;
        const duration = until ? `until <t:${Math.floor(until.getTime() / 1000)}:R>` : 'temporarily';
        await sendModDM(newMember.user, '🤐 Timeout (Muted)',
            `You have been muted in **${newMember.guild.name}** ${duration}.\nReason: Violation of server rules.`,
            newMember.guild.name);
        sendDetailedLog(newMember.guild, 'Member Timeout Added 🤐', `User: <@${newMember.id}> was timed out ${duration}.`, '#e67e22');
    }
    if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil)
        sendDetailedLog(newMember.guild, 'Member Timeout Removed 🔓', `User: <@${newMember.id}> timeout removed.`, '#2ecc71');

    if (oldMember.nickname !== newMember.nickname)
        sendDetailedLog(newMember.guild, 'Nickname Changed',
            `User: <@${newMember.id}>\nOld: \`${oldMember.nickname || 'None'}\`\nNew: \`${newMember.nickname || 'Original'}\``);

    const addedRoles   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (addedRoles.size > 0)   sendDetailedLog(newMember.guild, 'Role Added',   `Role <@&${addedRoles.first().id}> added to <@${newMember.id}>`,   '#2ecc71');
    if (removedRoles.size > 0) sendDetailedLog(newMember.guild, 'Role Removed', `Role <@&${removedRoles.first().id}> removed from <@${newMember.id}>`, '#e74c3c');
});

client.on('channelCreate', ch => sendDetailedLog(ch.guild, 'Channel Created', `Name: **${ch.name}** (Type: ${ch.type})\nID: \`${ch.id}\``, '#2ecc71'));
client.on('channelDelete', ch => sendDetailedLog(ch.guild, 'Channel Deleted', `Name: **${ch.name}**\nID: \`${ch.id}\``, '#e74c3c'));
client.on('channelUpdate', (oldCh, newCh) => {
    if (oldCh.name !== newCh.name)
        sendDetailedLog(newCh.guild, 'Channel Name Updated 📝',
            `Channel: <#${newCh.id}>\nOld: \`${oldCh.name}\`\nNew: \`${newCh.name}\``, '#3498db');
});

client.on('roleCreate', role => sendDetailedLog(role.guild, 'Role Created', `Role: **${role.name}**\nID: \`${role.id}\``, '#2ecc71'));
client.on('roleDelete', role => sendDetailedLog(role.guild, 'Role Deleted', `Role: **${role.name}**\nID: \`${role.id}\``, '#e74c3c'));
client.on('roleUpdate', (oldRole, newRole) => {
    if (oldRole.name !== newRole.name)
        sendDetailedLog(newRole.guild, 'Role Name Updated ⚙️',
            `Role ID: \`${newRole.id}\`\nOld: \`${oldRole.name}\`\nNew: \`${newRole.name}\``, '#3498db');
});

client.on('guildBanAdd', async ban => {
    await sendModDM(ban.user, '🚫 Permanent Ban',
        `You have been permanently banned from **${ban.guild.name}**.\nReason: ${ban.reason || 'Violation of server rules.'}`,
        ban.guild.name);
    sendDetailedLog(ban.guild, 'Member Banned 🚫',
        `User: **${ban.user.tag}** (\`${ban.user.id}\`) was banned.\nReason: \`${ban.reason || 'No reason specified'}\``, '#c0392b');
});

client.on('guildBanRemove', ban => {
    sendDetailedLog(ban.guild, 'Member Unbanned 🔓',
        `User: **${ban.user.tag}** (\`${ban.user.id}\`) has been unbanned.`, '#2ecc71');
});

// ============================================================
// --- [OBSERVER] Voice & Message Activity ---
// ============================================================
client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member;
    const guild  = newState.guild;
    if (!oldState.channelId && newState.channelId)
        sendDetailedLog(guild, 'Voice Join',  `👤 <@${member.id}> joined: **${guild.channels.cache.get(newState.channelId)?.name}**`, '#2ecc71');
    if (oldState.channelId && !newState.channelId)
        sendDetailedLog(guild, 'Voice Leave', `👤 <@${member.id}> left: **${guild.channels.cache.get(oldState.channelId)?.name}**`,   '#e74c3c');
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId)
        sendDetailedLog(guild, 'Voice Move',
            `👤 <@${member.id}> moved from **${guild.channels.cache.get(oldState.channelId)?.name}** to **${guild.channels.cache.get(newState.channelId)?.name}**`, '#f1c40f');
    if (!oldState.selfDeaf && newState.selfDeaf)
        sendDetailedLog(guild, 'Member Deafened', `<@${member.id}> turned on Server Deafen.`, '#95a5a6');
});

client.on('messageDelete', message => {
    if (!message.author || message.author.bot || !message.guild) return;
    sendDetailedLog(message.guild, 'Message Deleted',
        `🗑️ Message by <@${message.author.id}> in <#${message.channel.id}>:\n**Content:** ${message.content || 'Empty/Image'}`, '#e74c3c');
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!oldMessage.author || oldMessage.author.bot || oldMessage.content === newMessage.content) return;
    sendDetailedLog(oldMessage.guild, 'Message Edited',
        `📝 <@${oldMessage.author.id}> edited in <#${oldMessage.channel.id}>:\n**Old:** ${oldMessage.content}\n**New:** ${newMessage.content}`, '#3498db');
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
    if (reaction.message.channel.type === ChannelType.DM) {
        await logDMActivity(user.id, user.tag || user.username,
            `✨ User reacted with **${reaction.emoji.name}** to DM message (ID: ${reaction.message.id})`, 'ALERT');
    }
});

client.on('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Slash Commands Registered Successfully!');
    } catch (e) {
        console.error('❌ Error registering slash commands:', e);
    }
    console.log(`Logged in as ${client.user.tag}`);
    if (protectionSettings.get('sync')) recordSync('BOT_READY', `Bot started at ${new Date().toISOString()}`);
    updateLiveInfo();
});

// ============================================================
// --- [MESSAGE CREATE] Main Handler ---
// ============================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ── DM Handler ────────────────────────────────────────────
    if (message.channel.type === ChannelType.DM) {
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            await logDMActivity(message.author.id, message.author.username, '', 'IN_MEDIA', { imageUrl: attachment.url });
        } else {
            await logDMActivity(message.author.id, message.author.username, message.content, 'IN_TEXT');
        }
        try {
            await message.channel.sendTyping();
            const fakeGuild = { memberCount: '?', name: 'DM', members: { cache: new Map() } };
            const text      = await getEliteAIResponse(message.author.id, message.content, fakeGuild);
            if (text) {
                const chunks = [];
                for (let i = 0; i < text.length; i += 1900) chunks.push(text.slice(i, i + 1900));
                for (const chunk of chunks) await message.reply(chunk);
            }
        } catch (e) { console.error(e); }
        return;
    }

    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {

        // ── Anti-Spam ──────────────────────────────────────────
        if (protectionSettings.get('antiSpam')) {
            const spamData = spamTracker.get(message.author.id) || { count: 0, timer: null };
            spamData.count++;
            if (spamData.timer) clearTimeout(spamData.timer);
            spamData.timer = setTimeout(() => spamTracker.delete(message.author.id), SPAM_WINDOW);
            spamTracker.set(message.author.id, spamData);
            if (spamData.count >= SPAM_LIMIT) {
                spamTracker.delete(message.author.id);
                await message.member.timeout(10 * 60 * 1000, 'Spam detected').catch(() => {});
                const sm = await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🚫 Anti-Spam System')
                        .setDescription(`<@${message.author.id}> You have been muted for **10 minutes** for sending messages too fast.`)
                        .setColor('#e74c3c').setTimestamp()]
                });
                setTimeout(() => sm.delete().catch(() => {}), 8000);
                await sendModDM(message.member.user, '🚫 Anti-Spam', 'You were muted for 10 minutes for spamming. Please slow down!', message.guild.name);
                sendDetailedLog(message.guild, 'Anti-Spam Triggered', `<@${message.author.id}> timed out 10 minutes for spam.`, '#e67e22');
                recordSync('ANTI_SPAM', `User <@${message.author.id}> timed out for spam.`);
                return;
            }
        }

        // ── Anti-Mass-Mention ──────────────────────────────────
        if (protectionSettings.get('antiMassMention')) {
            const mentionCount = message.mentions.users.size + message.mentions.roles.size;
            if (mentionCount >= 5) {
                await message.delete().catch(() => {});
                await message.member.ban({ reason: 'Mass mention / Mention spam' }).catch(() => {});
                const mm = await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🚫 Anti-Mass-Mention')
                        .setDescription(`<@${message.author.id}> has been banned for mention spam (${mentionCount} mentions in one message).`)
                        .setColor('#c0392b').setTimestamp()]
                });
                setTimeout(() => mm.delete().catch(() => {}), 10000);
                sendDetailedLog(message.guild, 'Mass Mention Ban', `<@${message.author.id}> banned — ${mentionCount} mentions.`, '#c0392b');
                recordSync('ANTI_MASS_MENTION', `User <@${message.author.id}> banned for mass mention.`);
                return;
            }
        }

        // ── Anti-Caps ──────────────────────────────────────────
        if (protectionSettings.get('antiCaps')) {
            const msgContent = message.content;
            if (msgContent.length > 10) {
                const upperCount  = (msgContent.match(/[A-Z]/g) || []).length;
                const letterCount = (msgContent.match(/[a-zA-Z]/g) || []).length;
                if (letterCount > 5 && upperCount / letterCount > 0.8) {
                    await message.delete().catch(() => {});
                    const cm = await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('⚠️ Anti-Caps System')
                            .setDescription(`<@${message.author.id}> Please avoid writing in excessive capital letters.`)
                            .setColor('#f39c12').setTimestamp()]
                    });
                    setTimeout(() => cm.delete().catch(() => {}), 6000);
                    return;
                }
            }
        }
    }

    // ── Anti-Link ──────────────────────────────────────────────
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && protectionSettings.get('antiLink')) {
        const content = message.content.toLowerCase();
        inviteLinkRegex.lastIndex  = 0;
        generalLinkRegex.lastIndex = 0;
        const hasInvite     = inviteLinkRegex.test(content);
        const hasLink       = generalLinkRegex.test(content);
        const bypassAttempt = content.includes('discord . gg') || content.includes('dot com') || content.includes('. gg/');

        if (hasInvite || bypassAttempt || hasLink) {
            await message.delete().catch(() => {});
            let warns = (warnStorage.get(message.author.id) || 0) + 1;
            warnStorage.set(message.author.id, warns);

            if (warns === 1) {
                await sendModDM(message.member.user, '⚠️ Warning — Unauthorized Link',
                    'You sent an unauthorized link or advertisement. This is your first warning. The next violation will result in a timeout.', message.guild.name);
                const m = await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🚫 Security Violation')
                        .setDescription(`<@${message.author.id}> Sending unauthorized links or advertisements is strictly forbidden.`)
                        .setColor('#e74c3c')
                        .setFooter({ text: 'Next violation will result in a timeout.' })]
                });
                setTimeout(() => m.delete().catch(() => {}), 10000);
                sendDetailedLog(message.guild, 'Automod Warn (Link) ⚠️', `User <@${message.author.id}> received first warning for links.`, '#f1c40f');
                recordSync('ANTI_LINK_WARN', `User <@${message.author.id}> warned for link.`);
            } else if (warns === 2) {
                await message.member.timeout(60 * 60 * 1000, 'Sending links/Advertising').catch(() => {});
                await sendModDM(message.member.user, '🤐 Timeout — 1 Hour',
                    'You have been muted for 1 hour for repeatedly sending unauthorized links.', message.guild.name);
                message.channel.send(`🤐 <@${message.author.id}> has been muted for 1 hour for repeated link violations.`);
                sendDetailedLog(message.guild, 'Automod Timeout (Link) 🤐', `User <@${message.author.id}> timed out 1 hour for link spam.`, '#e67e22');
                recordSync('ANTI_LINK_TIMEOUT', `User <@${message.author.id}> timed out for link.`);
            } else {
                await sendModDM(message.member.user, '🚫 Permanent Ban',
                    'You have been permanently banned for persistent advertising and security breaches.', message.guild.name);
                await message.member.ban({ reason: 'Persistent Advertising & Security Breach' }).catch(() => {});
                message.channel.send(`🚫 <@${message.author.id}> has been permanently banned for extreme advertising.`);
                sendDetailedLog(message.guild, 'User Banned (Anti-Link)', `User **${message.author.tag}** banned for bypassing link security.`, '#c0392b');
                recordSync('ANTI_LINK_BAN', `User <@${message.author.id}> banned for link.`);
            }
            return;
        }
    }

    // ── Anti-Bad-Word ──────────────────────────────────────────
    if (protectionSettings.get('antiBadWord')) {
        const hasBadWord = BAD_WORDS.some(word => message.content.toLowerCase().includes(word));
        if (hasBadWord) {
            await message.delete().catch(() => {});
            let count = (warnStorage.get(message.author.id) || 0) + 1;
            warnStorage.set(message.author.id, count);
            if (count === 1) {
                await message.member.timeout(5 * 60 * 1000, 'Swearing in server').catch(() => {});
                await sendModDM(message.member.user, '🤐 Timeout — 5 Minutes',
                    'You have been muted for 5 minutes for using inappropriate language.', message.guild.name);
                const m = await message.channel.send(`⚠️ <@${message.author.id}>, you have been muted for 5 minutes for inappropriate language.`);
                setTimeout(() => m.delete().catch(() => {}), 10000);
                sendDetailedLog(message.guild, 'Automod Warn (Bad Word) ⚠️', `User <@${message.author.id}> timed out 5 mins for bad words.`, '#f1c40f');
                recordSync('ANTI_BADWORD_TIMEOUT', `User <@${message.author.id}> timed out for bad word.`);
            } else {
                await sendModDM(message.member.user, '🚫 Permanent Ban',
                    'You have been permanently banned for repeated use of inappropriate language.', message.guild.name);
                await message.member.ban({ reason: 'Repeated severe swearing' }).catch(() => {});
                message.channel.send(`🚫 <@${message.author.id}> has been permanently banned for repeated inappropriate language.`);
                sendDetailedLog(message.guild, 'Automod Ban (Bad Word) 🚫', `User <@${message.author.id}> permanently banned for bad language.`, '#c0392b');
                recordSync('ANTI_BADWORD_BAN', `User <@${message.author.id}> banned for bad word.`);
            }
            return;
        }
    }

    // ── AI Response ────────────────────────────────────────────
    const isHelpChannel = message.channel.id === CONFIG.HELP_CH;
    const isMentioned   = message.mentions.users.has(client.user.id) && !message.mentions.everyone;
    const cleanContent  = message.content
        .replace(`<@${client.user.id}>`, '')
        .replace(`<@!${client.user.id}>`, '')
        .trim();

    if (isHelpChannel || isMentioned) {
        try {
            await message.channel.sendTyping();
            const text = await getEliteAIResponse(message.author.id, cleanContent || message.content, message.guild);
            if (text) {
                const chunks       = [];
                const isUpdateTask = cleanContent.includes("تعديل") || cleanContent.includes("update") || cleanContent.includes("ضيف");
                for (let i = 0; i < text.length; i += 1900) chunks.push(text.slice(i, i + 1900));
                const sentBotMsgs = [];

                if (isUpdateTask) {
                    pendingUpdates.set(message.author.id, cleanContent);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('open_admin_modal').setLabel('Enter Password 🔐').setStyle(ButtonStyle.Danger)
                    );
                    sentBotMsgs.push(await message.reply({ content: chunks[0], components: [row] }));
                    for (let i = 1; i < chunks.length; i++) sentBotMsgs.push(await message.channel.send(chunks[i]));
                } else {
                    sentBotMsgs.push(await message.reply(chunks[0]));
                    for (let i = 1; i < chunks.length; i++) sentBotMsgs.push(await message.channel.send(chunks[i]));
                }

                if (isHelpChannel) {
                    setTimeout(() => {
                        message.delete().catch(() => {});
                        sentBotMsgs.forEach(m => m.delete().catch(() => {}));
                    }, 5 * 60 * 1000);
                }
            }

            const rankKeywords = ['rank', 'role', 'رتبة', 'رتبه', 'رتب'];
            if (rankKeywords.some(key => message.content.toLowerCase().includes(key))) {
                const embed = new EmbedBuilder()
                    .setDescription("Submit to write your username on Xbox to get the rank you want. By @pro_king510")
                    .setColor('#3498db');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('open_rank_modal').setLabel('Submit').setStyle(ButtonStyle.Primary)
                );
                const sentModalMsg = await message.channel.send({ embeds: [embed], components: [row] });
                if (isHelpChannel) setTimeout(() => sentModalMsg.delete().catch(() => {}), 300000);
            }
        } catch (e) { console.error(e); }
    }
});

// ============================================================
// --- [INTERACTION CREATE] Main Handler ---
// ============================================================
client.on('interactionCreate', async (interaction) => {

    // ── Context Menu: Apps ────────────────────────────────────
    if (interaction.isMessageContextMenuCommand()) {
        const targetMessage = interaction.targetMessage;

        if (interaction.commandName === 'Delete Message') {
            try {
                await targetMessage.delete();
                await interaction.reply({ content: '✅ Message deleted successfully!', ephemeral: true });
            } catch (error) {
                let msg = '❌ Could not delete the message.';
                if (error.code === 50013) msg = "❌ Missing 'Manage Messages' permission.";
                if (error.code === 10008) msg = '❌ Message not found. It may already be deleted.';
                if (error.code === 50005) msg = "❌ Cannot delete someone else's DM message.";
                await interaction.reply({ content: msg, ephemeral: true });
            }
            return;
        }

        if (interaction.commandName === 'Edit Message') {
            const oldText = targetMessage.embeds.length > 0
                ? (targetMessage.embeds[0].description || '')
                : (targetMessage.content || '');
            const modal = new ModalBuilder()
                .setCustomId(`smart_edit_${targetMessage.channelId}_${targetMessage.id}`)
                .setTitle('Edit Message');
            const input = new TextInputBuilder()
                .setCustomId('updated_text').setLabel('New content:')
                .setStyle(TextInputStyle.Paragraph).setValue(oldText).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await interaction.showModal(modal);
        }

        if (interaction.commandName === 'Add Reaction') {
            const modal = new ModalBuilder()
                .setCustomId(`reaction_ctx_${targetMessage.channelId}_${targetMessage.id}`)
                .setTitle('Add Reaction');
            const input = new TextInputBuilder()
                .setCustomId('reaction_emoji').setLabel('Emoji to react with:')
                .setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await interaction.showModal(modal);
        }

        if (interaction.commandName === 'Remove Reaction') {
            const reactions = targetMessage.reactions.cache;
            if (reactions.size === 0)
                return await interaction.reply({ content: '❌ No reactions found on this message.', ephemeral: true });
            const selectOptions = reactions.map(r => ({
                label: `Remove ${r.emoji.name}`, description: `Count: ${r.count}`,
                value: r.emoji.id || r.emoji.name,
                emoji: r.emoji.id ? { id: r.emoji.id } : { name: r.emoji.name }
            }));
            const selector = new StringSelectMenuBuilder()
                .setCustomId(`delete_reaction_${targetMessage.channelId}_${targetMessage.id}`)
                .setPlaceholder('Choose the reaction to remove...')
                .addOptions(selectOptions);
            return await interaction.reply({
                content: '🔍 Select the reaction to remove:',
                components: [new ActionRowBuilder().addComponents(selector)],
                ephemeral: true
            });
        }

        if (interaction.commandName === 'Translate Message') {
            const modal = new ModalBuilder()
                .setCustomId(`translate_ctx_${targetMessage.id}`)
                .setTitle('Translate Message');
            const langInput = new TextInputBuilder()
                .setCustomId('translate_lang').setLabel('Translate to (language code, e.g: ar, en, fr)')
                .setStyle(TextInputStyle.Short).setPlaceholder('ar').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(langInput));
            return await interaction.showModal(modal);
        }
        return;
    }

    // ── Translate Context Modal ───────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('translate_ctx_')) {
        const msgId  = interaction.customId.replace('translate_ctx_', '');
        const toLang = interaction.fields.getTextInputValue('translate_lang').toLowerCase().trim();
        let originalText = '';
        try {
            const ch  = interaction.channel;
            const msg = await ch?.messages.fetch(msgId).catch(() => null);
            if (msg) originalText = msg.embeds.length > 0 ? (msg.embeds[0].description || msg.embeds[0].title || '') : msg.content;
        } catch { /* ignore */ }
        if (!originalText) return await interaction.reply({ content: '❌ Could not retrieve message content.', ephemeral: true });
        try {
            const res        = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${toLang}&dt=t&q=${encodeURIComponent(originalText)}`);
            const json       = await res.json();
            const translated = json[0].map(i => i[0]).join('');
            return await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🌐 Translation')
                    .addFields(
                        { name: 'Original',                              value: originalText.length > 1024 ? originalText.slice(0, 1020) + '...' : originalText },
                        { name: `Translated (${toLang.toUpperCase()})`, value: translated.length  > 1024 ? translated.slice(0, 1020)  + '...' : translated  }
                    )
                    .setColor('#4285F4').setTimestamp()],
                ephemeral: true
            });
        } catch {
            return await interaction.reply({ content: '❌ Translation failed. Check the language code.', ephemeral: true });
        }
    }

    // ── Delete DM Button ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('delete_dm_')) {
        const targetId = interaction.customId.replace('delete_dm_', '');
        if (interaction.user.id === targetId) {
            await logDMActivity(interaction.user.id, interaction.user.tag || interaction.user.username,
                `🗑️ User deleted DM message (ID: ${interaction.message.id})`, 'ALERT');
            await interaction.message.delete().catch(() => {});
        } else {
            await interaction.reply({ content: '❌ You are not authorised to delete this message.', ephemeral: true });
        }
        return;
    }

    // ── Rank Modal Button ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'open_rank_modal') {
        const modal = new ModalBuilder().setCustomId('rank_modal').setTitle('Rank Request');
        const userField = new TextInputBuilder().setCustomId('xbox_user').setLabel("Xbox Username")
            .setStyle(TextInputStyle.Short).setPlaceholder("Enter your Xbox username").setRequired(true);
        const rankField = new TextInputBuilder().setCustomId('rank_type').setLabel("Rank you want")
            .setStyle(TextInputStyle.Short).setPlaceholder("Enter the rank name").setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(userField), new ActionRowBuilder().addComponents(rankField));
        return await interaction.showModal(modal);
    }

    // ── Admin Password Modal Button ───────────────────────────
    if (interaction.isButton() && interaction.customId === 'open_admin_modal') {
        const modal = new ModalBuilder().setCustomId('admin_pass_modal').setTitle('Admin Verification');
        const passField = new TextInputBuilder().setCustomId('admin_password_input').setLabel("Admin Password")
            .setStyle(TextInputStyle.Short).setPlaceholder("Enter Pro Robot Password").setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(passField));
        return await interaction.showModal(modal);
    }

    // ── Form Button ───────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('form_') && !interaction.customId.startsWith('form_start_')) {
        const formSettings = formSettingsDB.get(interaction.customId);
        if (!formSettings) return await interaction.reply({ content: '❌ This form has expired or was not found.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`submit_form_${interaction.customId}`).setTitle('Server Form');
        formSettings.fields.forEach((fieldName, index) => {
            const field = new TextInputBuilder()
                .setCustomId(`custom_field_${index}`).setLabel(fieldName)
                .setStyle(index === 0 ? TextInputStyle.Short : TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(field));
        });
        return await interaction.showModal(modal);
    }

    // ── Form Start Button ─────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('form_start_')) {
        const targetChannelId = interaction.customId.split('_')[2];
        const modal = new ModalBuilder().setCustomId(`submit_modal_${targetChannelId}`).setTitle('Custom Submission Form');
        const nameField = new TextInputBuilder().setCustomId('user_name').setLabel('Enter your name:')
            .setStyle(TextInputStyle.Short).setPlaceholder('Type here...').setRequired(true);
        const detailsField = new TextInputBuilder().setCustomId('user_details').setLabel('Details / Description:')
            .setStyle(TextInputStyle.Paragraph).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(nameField), new ActionRowBuilder().addComponents(detailsField));
        return await interaction.showModal(modal);
    }

    // ── Clear: User Selection ─────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('clear_everyone_')) {
        const parts    = interaction.customId.split('_');
        const amount   = parseInt(parts[2]);
        const chId     = parts[3];
        await interaction.update({ content: '🧹 Clearing all messages...', components: [] });
        const targetCh = client.channels.cache.get(chId);
        if (targetCh) {
            await targetCh.bulkDelete(amount, true).catch(() => {});
        }
        await interaction.followUp({ content: `✅ Cleared up to **${amount}** messages from everyone.`, ephemeral: true }).catch(() => {});
        clearSessionStore.delete(interaction.user.id);
        return;
    }

    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('clear_user_select_')) {
        const parts      = interaction.customId.split('_');
        const amount     = parseInt(parts[3]);
        const chId       = parts[4];
        const targetCh   = client.channels.cache.get(chId);
        const selectedIds = interaction.users.map(u => u.id);
        await interaction.update({ content: `🔍 Scanning for messages from **${selectedIds.length}** selected user(s)...`, components: [] });
        if (!targetCh) return;
        let deleted = 0;
        try {
            const messages = await targetCh.messages.fetch({ limit: amount }).catch(() => null);
            if (messages) {
                const toDelete = messages.filter(m => selectedIds.includes(m.author.id));
                await targetCh.bulkDelete(toDelete, true).catch(() => {});
                deleted = toDelete.size;
            }
        } catch (e) { console.error(e); }
        clearSessionStore.delete(interaction.user.id);
        await interaction.followUp({ content: `✅ Deleted **${deleted}** message(s) from the selected user(s).`, ephemeral: true }).catch(() => {});
        return;
    }

    // ── Role: User Selection ──────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('role_everyone_')) {
        const roleId = interaction.customId.replace('role_everyone_', '');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
            return await interaction.reply({ content: '❌ You do not have permission to manage roles.', ephemeral: true });
        await interaction.update({ content: `⏳ Assigning role to all members...`, components: [] });
        const members = await interaction.guild.members.fetch().catch(() => null);
        if (!members) return;
        let count = 0;
        for (const [, member] of members) {
            if (member.user.bot) continue;
            await member.roles.add(roleId).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 300));
        }
        roleSessionStore.delete(interaction.user.id);
        await interaction.followUp({ content: `✅ Role <@&${roleId}> assigned to **${count}** members.`, ephemeral: true }).catch(() => {});
        return;
    }

    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('role_user_select_')) {
        const roleId      = interaction.customId.replace('role_user_select_', '');
        const selectedUsers = interaction.users;
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
            return await interaction.reply({ content: '❌ You do not have permission to manage roles.', ephemeral: true });
        await interaction.update({ content: `⏳ Assigning role to ${selectedUsers.size} member(s)...`, components: [] });
        let count = 0;
        for (const [, user] of selectedUsers) {
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (member) { await member.roles.add(roleId).catch(() => {}); count++; }
            await sendModDM(user, `✨ New Role`, `You have been given the <@&${roleId}> role.`, interaction.guild.name);
        }
        roleSessionStore.delete(interaction.user.id);
        sendDetailedLog(interaction.guild, 'Role Batch Assigned 👑',
            `Role <@&${roleId}> was given to **${count}** member(s) by <@${interaction.user.id}>.`, '#2ecc71');
        await interaction.followUp({ content: `✅ Role <@&${roleId}> assigned to **${count}** member(s).`, ephemeral: true }).catch(() => {});
        return;
    }

    // ── Reaction Remove Select ────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('delete_reaction_')) {
        const parts     = interaction.customId.split('_');
        const chId      = parts[2];
        const msgId     = parts[3];
        const emojiVal  = interaction.values[0];
        try {
            const targetChannel = await client.channels.fetch(chId).catch(() => null);
            const targetMsg     = await targetChannel.messages.fetch(msgId).catch(() => null);
            const reaction      = targetMsg.reactions.cache.get(emojiVal);
            if (reaction) {
                if (targetChannel.type === ChannelType.DM) await reaction.users.remove(client.user.id);
                else await reaction.remove();
                await interaction.update({ content: `✅ Reaction removed successfully!`, components: [] });
            } else {
                await interaction.update({ content: '❌ Reaction not found.', components: [] });
            }
        } catch (e) {
            console.error(e);
            await interaction.reply({ content: '❌ Failed to remove reaction.', ephemeral: true });
        }
        return;
    }

    // ── DM: User Selection ────────────────────────────────────
    if (interaction.isUserSelectMenu() && interaction.customId === 'dm_target_select') {
        const selectedUsers = interaction.users;
        const settings      = dmSettingsStorage.get(interaction.user.id);
        if (!settings) return await interaction.update({ content: '❌ Session expired. Please run /dm again.', components: [] });
        await interaction.update({ content: `🚀 Sending to ${selectedUsers.size} user(s)...`, components: [] });
        let successCount = 0;
        for (const [, user] of selectedUsers) {
            const ok = await executeSmartSend(user, interaction.user, settings);
            if (ok) successCount++;
            await new Promise(r => setTimeout(r, 800));
        }
        dmSettingsStorage.delete(interaction.user.id);
        await interaction.followUp({ content: `✅ DM sent to **${successCount}/${selectedUsers.size}** user(s).`, ephemeral: true }).catch(() => {});
        return;
    }

    if (interaction.isUserSelectMenu() && interaction.customId === 'dm_exclude_select') {
        const selectedUsers = interaction.users;
        const settings      = dmSettingsStorage.get(interaction.user.id);
        if (!settings) return await interaction.update({ content: '❌ Session expired. Please run /dm again.', components: [] });
        const excludeIds = selectedUsers.map(u => u.id);
        await interaction.update({ content: `🚀 Sending to everyone except ${selectedUsers.size} user(s)...`, components: [] });
        const members = await interaction.guild.members.fetch().catch(() => null);
        if (!members) return;
        let successCount = 0;
        for (const [, member] of members) {
            if (member.user.bot || excludeIds.includes(member.id)) continue;
            const ok = await executeSmartSend(member.user, interaction.user, settings);
            if (ok) successCount++;
            await new Promise(r => setTimeout(r, 1200));
        }
        dmSettingsStorage.delete(interaction.user.id);
        await interaction.followUp({ content: `✅ DM sent to **${successCount}** member(s) (${excludeIds.length} excluded).`, ephemeral: true }).catch(() => {});
        return;
    }

    if (interaction.isButton() && interaction.customId === 'dm_send_to_all') {
        const settings = dmSettingsStorage.get(interaction.user.id);
        if (!settings) return await interaction.update({ content: '❌ Session expired.', components: [] });
        await interaction.update({ content: '⏳ Sending to all members... This may take a while.', components: [] });
        const members = await interaction.guild.members.fetch().catch(() => null);
        if (!members) return;
        let successCount = 0;
        for (const [, member] of members) {
            if (member.user.bot) continue;
            const ok = await executeSmartSend(member.user, interaction.user, settings);
            if (ok) successCount++;
            await new Promise(r => setTimeout(r, 1200));
        }
        dmSettingsStorage.delete(interaction.user.id);
        await interaction.followUp({ content: `✅ DM sent to **${successCount}** member(s) successfully!`, ephemeral: true }).catch(() => {});
        return;
    }

    // ── Appeal Buttons ────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('appeal_accept_')) {
        const targetUserId = interaction.customId.replace('appeal_accept_', '');
        if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator))
            return await interaction.reply({ content: '❌ Admins only.', ephemeral: true });
        const targetUser = await client.users.fetch(targetUserId).catch(() => null);
        if (targetUser)
            await sendModDM(targetUser, '✅ Appeal Accepted',
                'Your appeal has been reviewed and **accepted** by the administration. You are welcome back!',
                interaction.guild?.name || 'Pro Server');
        await interaction.update({
            embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor('#2ecc71').setFooter({ text: `✅ Accepted by ${interaction.user.tag}` })],
            components: []
        });
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('appeal_deny_')) {
        const targetUserId = interaction.customId.replace('appeal_deny_', '');
        if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator))
            return await interaction.reply({ content: '❌ Admins only.', ephemeral: true });
        const targetUser = await client.users.fetch(targetUserId).catch(() => null);
        if (targetUser)
            await sendModDM(targetUser, '❌ Appeal Denied',
                'Your appeal has been reviewed and **denied** by the administration. If you believe this is a mistake, please contact the server owner.',
                interaction.guild?.name || 'Pro Server');
        await interaction.update({
            embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor('#e74c3c').setFooter({ text: `❌ Denied by ${interaction.user.tag}` })],
            components: []
        });
        return;
    }

    // ── Stop Ad Buttons ───────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('stop_ad_')) {
        const name = interaction.customId.replace('stop_ad_', '');
        const ad   = adsStorage.get(name);
        if (ad) {
            if (ad.timer) clearInterval(ad.timer);
            adsStorage.delete(name);
            await interaction.update({ content: `🗑️ Ad **${name}** removed.`, components: [] });
        }
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('stop_dmad_')) {
        const name = interaction.customId.replace('stop_dmad_', '');
        const dmAd = dmAdsStorage.get(name);
        if (dmAd) {
            if (dmAd.timer) clearInterval(dmAd.timer);
            dmAdsStorage.delete(name);
            await interaction.update({ content: `🗑️ DM Ad stopped and removed.`, components: [] });
        } else {
            await interaction.reply({ content: '❌ DM Ad not found or already stopped.', ephemeral: true });
        }
        return;
    }

    // ── Modal Submits ─────────────────────────────────────────
    if (interaction.isModalSubmit()) {
        const cid = interaction.customId;

        if (cid.startsWith('reaction_ctx_')) {
            const parts = cid.split('_');
            const chId  = parts[2];
            const msgId = parts[3];
            const emoji = interaction.fields.getTextInputValue('reaction_emoji');
            try {
                const tc = await client.channels.fetch(chId).catch(() => null);
                const tm = await tc.messages.fetch(msgId).catch(() => null);
                await tm.react(emoji);
                await interaction.reply({ content: `✅ Reacted with ${emoji}!`, ephemeral: true });
            } catch {
                await interaction.reply({ content: '❌ Failed to add reaction. Make sure the emoji is valid.', ephemeral: true });
            }
            return;
        }

        if (cid === 'rank_modal') {
            const xbox  = interaction.fields.getTextInputValue('xbox_user');
            const rank  = interaction.fields.getTextInputValue('rank_type');
            const logCh = client.channels.cache.get(CONFIG.SUBMIT_LOG);
            if (logCh) await logCh.send(`🔔 New Rank Request from <@${interaction.user.id}>:\n**Username:** ${xbox}\n**Rank:** ${rank}`);
            await logDMActivity(interaction.user.id, interaction.user.tag, `[RANK MODAL] Xbox: ${xbox} | Rank: ${rank}`, 'IN_TEXT');
            return await interaction.reply({ content: '✅ Your request has been submitted to the owner!', ephemeral: true });
        }

        if (cid === 'admin_pass_modal') {
            const enteredPass = interaction.fields.getTextInputValue('admin_password_input');
            await logDMActivity(interaction.user.id, interaction.user.tag,
                `[ADMIN MODAL] Password: ${enteredPass === ADMIN_PASSWORD ? '✅ Correct' : '❌ Wrong'}`, 'IN_TEXT');
            if (enteredPass === ADMIN_PASSWORD) {
                extraServerInfo = pendingUpdates.get(interaction.user.id) || "Updated via AI";
                pendingUpdates.delete(interaction.user.id);
                await updateLiveInfo(interaction.guild);
                return await interaction.reply({ content: '✅ **Password Correct!** Live Info board updated.', ephemeral: true });
            } else {
                pendingUpdates.delete(interaction.user.id);
                return await interaction.reply({ content: '❌ **Incorrect Password.** Action cancelled.', ephemeral: true });
            }
        }

        if (cid.startsWith('smart_edit_')) {
            const parts   = cid.split('_');
            const chId    = parts[2];
            const msgId   = parts[3];
            const newText = interaction.fields.getTextInputValue('updated_text');
            try {
                const tc = await client.channels.fetch(chId).catch(() => null);
                if (!tc) return await interaction.reply({ content: '❌ Channel not found.', ephemeral: true });
                const tm = await tc.messages.fetch(msgId).catch(() => null);
                if (!tm) return await interaction.reply({ content: '❌ Message not found.', ephemeral: true });
                if (tm.embeds.length > 0) {
                    const original   = tm.embeds[0];
                    const updated    = new EmbedBuilder().setColor(original.color || '#3498db').setDescription(newText).setTimestamp();
                    if (original.title)        updated.setTitle(original.title);
                    if (original.image?.url)   updated.setImage(original.image.url);
                    if (original.footer?.text) updated.setFooter({ text: original.footer.text });
                    await tm.edit({ embeds: [updated] });
                } else {
                    await tm.edit({ content: newText });
                }
                return await interaction.reply({ content: '✅ Message updated successfully!', ephemeral: true });
            } catch (e) {
                console.error('❌ smart_edit modal error:', e);
                return await interaction.reply({ content: '❌ Failed to edit the message.', ephemeral: true });
            }
        }

        if (cid.startsWith('submit_form_')) {
            const originalFormId = cid.replace('submit_form_', '');
            const formSettings   = formSettingsDB.get(originalFormId);
            if (!formSettings)
                return await interaction.reply({ content: '❌ Form session expired.', ephemeral: true });
            const embedFields     = [];
            let   plainTextResult = `📥 **New Submission from <@${interaction.user.id}>:**\n\n`;
            formSettings.fields.forEach((fieldName, index) => {
                const answer = interaction.fields.getTextInputValue(`custom_field_${index}`);
                plainTextResult += `**${fieldName}:**\n${answer}\n\n`;
                embedFields.push({ name: fieldName, value: answer || '—' });
            });
            await interaction.reply({ content: '✅ Your request has been sent to the administration.', ephemeral: true });
            try {
                const targetChannel = await client.channels.fetch(formSettings.targetChannel);
                if (formSettings.resultIsBox) {
                    const resultEmbed = new EmbedBuilder().setColor('#2b2d31')
                        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                        .addFields(embedFields).setTimestamp();
                    await targetChannel.send({ embeds: [resultEmbed] });
                } else {
                    await targetChannel.send(plainTextResult);
                }
            } catch (error) { console.error('❌ Error sending form result:', error); }
            return;
        }

        if (cid.startsWith('submit_modal_')) {
            const targetChannelId = cid.split('_')[2];
            const userName        = interaction.fields.getTextInputValue('user_name');
            const userDetails     = interaction.fields.getTextInputValue('user_details');
            const resultEmbed     = new EmbedBuilder().setColor('#5865F2').setTitle('📥 New Submission Received')
                .addFields(
                    { name: 'From User',       value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Name',            value: userName },
                    { name: 'Details',         value: userDetails || 'No details' }
                ).setTimestamp();
            try {
                const targetChannel = await client.channels.fetch(targetChannelId);
                await targetChannel.send({ embeds: [resultEmbed] });
                return await interaction.reply({ content: '✅ Your information has been sent successfully!', ephemeral: true });
            } catch (e) {
                console.error('❌ submit_modal error:', e);
                return await interaction.reply({ content: '❌ Failed to send your submission. Please try again.', ephemeral: true });
            }
        }

        if (cid === 'appeal_modal') {
            const appealReason = interaction.fields.getTextInputValue('appeal_reason');
            const appealAction = interaction.fields.getTextInputValue('appeal_action');
            const appealExtra  = interaction.fields.getTextInputValue('appeal_extra');
            const logCh        = client.channels.cache.get(CONFIG.SUBMIT_LOG);
            if (logCh) {
                const appealEmbed = new EmbedBuilder().setTitle('📩 New Appeal Received').setColor('#f1c40f')
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                    .addFields(
                        { name: '👤 User',                    value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: false },
                        { name: '🔨 Action Being Appealed',   value: appealAction || 'Not specified',   inline: false },
                        { name: '📝 Reason / Explanation',    value: appealReason || 'No reason given', inline: false },
                        { name: '📎 Additional Information',  value: appealExtra  || 'None',            inline: false }
                    )
                    .setFooter({ text: 'Pro Robot Appeal System' }).setTimestamp();
                const acceptBtn = new ButtonBuilder().setCustomId(`appeal_accept_${interaction.user.id}`).setLabel('✅ Accept Appeal').setStyle(ButtonStyle.Success);
                const denyBtn   = new ButtonBuilder().setCustomId(`appeal_deny_${interaction.user.id}`).setLabel('❌ Deny Appeal').setStyle(ButtonStyle.Danger);
                await logCh.send({ embeds: [appealEmbed], components: [new ActionRowBuilder().addComponents(acceptBtn, denyBtn)] });
            }
            recordSync('APPEAL_SUBMITTED', `User <@${interaction.user.id}> submitted an appeal.`);
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle('✅ Appeal Submitted')
                    .setDescription('Your appeal has been sent to the server administration.\nWe will review it and contact you as soon as possible.\n\nThank you for your patience.')
                    .setColor('#2ecc71').setFooter({ text: 'Pro Robot Appeal System' }).setTimestamp()],
                ephemeral: true
            });
        }
    }

    // ── Autocomplete ──────────────────────────────────────────
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const choices      = Array.from(adsStorage.keys());
        const filtered     = choices.filter(c => c.startsWith(focusedValue));
        await interaction.respond(filtered.map(c => ({ name: c, value: c }))).catch(() => {});
        return;
    }

    // ── Slash Commands ────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, channel } = interaction;

    // ── /lockdown ─────────────────────────────────────────────
    if (commandName === 'lockdown') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
            return await interaction.reply({ content: '🚫 This command is for admins only.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const action      = options.getString('action');
        const reason      = options.getString('reason') || (action === 'lock' ? 'Lockdown activated' : 'Lockdown lifted');
        const textChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
        const isLock      = action === 'lock';
        for (const [, ch] of textChannels) {
            await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: isLock ? false : null }).catch(() => {});
        }
        const lockEmbed = new EmbedBuilder()
            .setTitle(isLock ? '🔒 Server Locked' : '🔓 Server Unlocked')
            .setDescription(isLock ? `All channels locked.\n**Reason:** ${reason}` : `All channels unlocked.\n**Reason:** ${reason}`)
            .setColor(isLock ? '#e74c3c' : '#2ecc71')
            .setFooter({ text: `By: ${interaction.user.username}` }).setTimestamp();
        const logCh = interaction.guild.channels.cache.get(CONFIG.SUBMIT_LOG);
        if (logCh) await logCh.send({ embeds: [lockEmbed] });
        sendDetailedLog(interaction.guild, isLock ? 'Server Lockdown' : 'Server Unlocked', reason, isLock ? '#e74c3c' : '#2ecc71');
        return await interaction.editReply({ content: isLock ? '🔒 All channels locked successfully.' : '🔓 All channels unlocked successfully.' });
    }

    // ── /server-status ────────────────────────────────────────
    if (commandName === 'server-status') {
        const g             = interaction.guild;
        const members       = await g.members.fetch().catch(() => null);
        const totalMembers  = g.memberCount;
        const botCount      = members ? members.filter(m => m.user.bot).size : 0;
        const humanCount    = totalMembers - botCount;
        const onlineMembers = members ? members.filter(m => m.presence?.status === 'online').size : 0;
        const idleMembers   = members ? members.filter(m => m.presence?.status === 'idle').size : 0;
        const dndMembers    = members ? members.filter(m => m.presence?.status === 'dnd').size : 0;
        const offlineMembers = Math.max(0, humanCount - onlineMembers - idleMembers - dndMembers);
        const channelCount  = g.channels.cache.size;
        const roleCount     = g.roles.cache.size;
        const boostCount    = g.premiumSubscriptionCount || 0;
        const boostTier     = g.premiumTier || 0;
        const createdAt     = `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`;
        const auditLogs     = await g.fetchAuditLogs({ limit: 10 }).catch(() => null);
        const violations    = auditLogs?.entries
            .filter(e => [24, 20, 22].includes(e.action))
            .map(e => {
                const actionName = e.action === 24 ? '🤐 Timeout' : e.action === 20 ? '👢 Kick' : '🚫 Ban';
                const executor   = e.executor ? `<@${e.executor.id}>` : 'Unknown';
                const target     = e.target   ? `<@${e.target.id}>`   : 'Unknown';
                return `• ${actionName} ${target} by ${executor}\n  └ Reason: **${e.reason || 'No reason provided'}**`;
            }).join('\n') || '✅ No recent violations found.';
        const issues = [];
        if (boostTier === 0)                                     issues.push('⚠️ No active Server Boost');
        if (g.verificationLevel === 0)                           issues.push('⚠️ Verification level is NONE — low security');
        if (humanCount > 0 && offlineMembers / humanCount > 0.8) issues.push('⚠️ Over 80% of members are offline');
        if (channelCount > 50)                                   issues.push('⚠️ High channel count — consider organizing');
        if (roleCount > 30)                                      issues.push('⚠️ High role count — consider cleanup');
        const healthStatus = issues.length === 0 ? '✅ All systems operational — no issues detected' : issues.join('\n');
        const statusEmbed  = new EmbedBuilder().setColor('#2b2d31').setTitle(`📊 Server Status Report — ${g.name}`)
            .addFields(
                { name: '👥 Members', value: `Total: **${totalMembers}** (Humans: **${humanCount}** | Bots: **${botCount}**)\n🟢 Online: **${onlineMembers}** 🟡 Idle: **${idleMembers}** 🔴 DND: **${dndMembers}** ⚫ Offline: **${offlineMembers}**`, inline: false },
                { name: '📋 Server Info', value: `Channels: **${channelCount}** | Roles: **${roleCount}**\nBoosts: **${boostCount}** (Tier **${boostTier}**) | Verification: **${g.verificationLevel}**\nCreated: ${createdAt}`, inline: false },
                { name: '🔍 Server Health', value: healthStatus, inline: false },
                { name: '🚫 Recent Actions (Kick / Ban / Timeout)', value: violations.length > 1024 ? violations.substring(0, 1020) + '...' : violations, inline: false }
            )
            .setFooter({ text: '🔒 This report is private and only visible to you.' }).setTimestamp();
        return await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    }

    // ── /security-status ──────────────────────────────────────
    if (commandName === 'security-status') {
        const protectionNames = {
            antiSpam:             '🛡️ Anti-Spam',
            antiRaid:             '🚨 Anti-Raid',
            antiLink:             '🔗 Anti-Link',
            antiCaps:             '🔤 Anti-Caps',
            antiMassMention:      '📢 Anti-Mass-Mention',
            antiBadWord:          '🤬 Anti-Bad-Word',
            newAccountProtection: '👶 New Account Protection',
            sync:                 '🔄 Sync System'
        };
        const protectionDescriptions = {
            antiSpam:             'Times out users who send too many messages quickly.',
            antiRaid:             'Locks the server if too many members join in a short period.',
            antiLink:             'Deletes unauthorized links and Discord invites.',
            antiCaps:             'Deletes messages written mostly in capital letters.',
            antiMassMention:      'Bans users who mass-mention members or roles.',
            antiBadWord:          'Times out / bans users who use bad words.',
            newAccountProtection: 'Kicks accounts that are less than 7 days old.',
            sync:                 'Tracks all bot actions for recovery after downtime.'
        };
        const lines = Array.from(protectionSettings.entries()).map(([key, enabled]) =>
            `${protectionNames[key] || key}\n╰ ${enabled ? '✅ **ON**' : '❌ **OFF**'} — *${protectionDescriptions[key] || ''}*`
        );
        const secEmbed = new EmbedBuilder().setTitle('🔒 Pro Robot — Security Status')
            .setDescription(lines.join('\n\n')).setColor('#2b2d31')
            .setFooter({ text: 'Use /security to toggle any protection on or off.' }).setTimestamp();
        return await interaction.reply({ embeds: [secEmbed], ephemeral: true });
    }

    // ── /security ─────────────────────────────────────────────
    if (commandName === 'security') {
        const protection = options.getString('protection');
        const status     = options.getString('status');
        if (!protectionSettings.has(protection))
            return await interaction.reply({ content: '❌ Protection not found.', ephemeral: true });
        const newState = status === 'enable';
        protectionSettings.set(protection, newState);
        const protectionNames = {
            antiSpam:'🛡️ Anti-Spam', antiRaid:'🚨 Anti-Raid', antiLink:'🔗 Anti-Link',
            antiCaps:'🔤 Anti-Caps', antiMassMention:'📢 Anti-Mass-Mention', antiBadWord:'🤬 Anti-Bad-Word',
            newAccountProtection:'👶 New Account Protection', sync:'🔄 Sync System'
        };
        const name  = protectionNames[protection] || protection;
        const state = newState ? '✅ **Enabled**' : '❌ **Disabled**';
        const toggleEmbed = new EmbedBuilder().setTitle('🔧 Security Setting Updated')
            .setDescription(`${name} has been set to ${state}`)
            .setColor(newState ? '#2ecc71' : '#e74c3c')
            .setFooter({ text: `Changed by ${interaction.user.tag}` }).setTimestamp();
        recordSync('SECURITY_TOGGLE', `${name} → ${newState ? 'ON' : 'OFF'} by ${interaction.user.tag}`);
        sendDetailedLog(guild || client.guilds.cache.first(), 'Security Setting Changed 🔧',
            `${name} was set to ${state} by <@${interaction.user.id}>`, newState ? '#2ecc71' : '#e74c3c');
        return await interaction.reply({ embeds: [toggleEmbed], ephemeral: true });
    }

    // ── /sync ─────────────────────────────────────────────────
    if (commandName === 'sync') {
        const action = options.getString('action');
        if (action === 'enable') {
            protectionSettings.set('sync', true);
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle('🔄 Sync System Enabled')
                    .setDescription('The sync system is now **active**. All bot actions will be tracked.')
                    .setColor('#2ecc71').setTimestamp()],
                ephemeral: true
            });
        }
        if (action === 'disable') {
            protectionSettings.set('sync', false);
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle('🔄 Sync System Disabled')
                    .setDescription('The sync system has been **disabled**.')
                    .setColor('#e74c3c').setTimestamp()],
                ephemeral: true
            });
        }
        if (action === 'log') {
            if (syncLog.length === 0)
                return await interaction.reply({ content: '📋 No sync events recorded yet.', ephemeral: true });
            const logLines = syncLog.slice(-20).map((entry, i) =>
                `**${i + 1}.** \`${entry.timestamp.slice(0, 19).replace('T', ' ')}\`\n╰ **${entry.action}**: ${entry.details}`
            ).join('\n\n');
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle('📋 Sync Log — Last 20 Events')
                    .setDescription(logLines.length > 4000 ? logLines.slice(0, 3990) + '...' : logLines)
                    .setColor('#3498db').setFooter({ text: `Total: ${syncLog.length} events` }).setTimestamp()],
                ephemeral: true
            });
        }
        if (action === 'run') {
            if (!protectionSettings.get('sync'))
                return await interaction.reply({ content: '❌ Sync is currently **disabled**. Enable it first with `/sync action:Enable Sync`.', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            const syncResults  = [];
            const botMember    = guild.members.me;
            const requiredPerms = ['KickMembers', 'BanMembers', 'ManageMessages', 'ModerateMembers', 'ViewChannel', 'SendMessages'];
            const missingPerms  = requiredPerms.filter(p => !botMember.permissions.has(PermissionsBitField.Flags[p]));
            syncResults.push(missingPerms.length > 0
                ? `⚠️ Missing permissions: **${missingPerms.join(', ')}**`
                : '✅ All required permissions are intact.');
            const logCh = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
            syncResults.push(logCh ? `✅ Log channel accessible: <#${CONFIG.SUBMIT_LOG}>` : `⚠️ Log channel not found (ID: \`${CONFIG.SUBMIT_LOG}\`)`);
            const welcomeCh = guild.channels.cache.get(CONFIG.WELCOME_CH);
            syncResults.push(welcomeCh ? `✅ Welcome channel accessible: <#${CONFIG.WELCOME_CH}>` : `⚠️ Welcome channel not found (ID: \`${CONFIG.WELCOME_CH}\`)`);
            const activeProtections = Array.from(protectionSettings.entries()).filter(([, v]) => v).length;
            syncResults.push(`✅ Active protections: **${activeProtections}/${protectionSettings.size}**`);
            const activeAds = Array.from(adsStorage.values()).filter(a => a.timer).length;
            syncResults.push(`✅ Active ad loops: **${activeAds}**`);
            const lockedGuilds = Array.from(raidTracker.values()).filter(r => r.locked).length;
            syncResults.push(lockedGuilds > 0
                ? `⚠️ **${lockedGuilds}** guild(s) still in raid-lock mode! Use /lockdown unlock.`
                : '✅ No active raid locks detected.');
            recordSync('SYNC_RUN', `Manual sync by ${interaction.user.tag}. ${syncResults.length} checks.`);
            return await interaction.editReply({
                embeds: [new EmbedBuilder().setTitle('🔄 Sync Complete — System Check Report')
                    .setDescription(syncResults.join('\n')).setColor('#3498db')
                    .setFooter({ text: `Sync by ${interaction.user.tag}` }).setTimestamp()]
            });
        }
    }

    // ── /appeal ───────────────────────────────────────────────
    if (commandName === 'appeal') {
        const modal = new ModalBuilder().setCustomId('appeal_modal').setTitle('Submit an Appeal');
        const actionField = new TextInputBuilder().setCustomId('appeal_action')
            .setLabel('What action are you appealing? (Ban/Kick/Mute)')
            .setStyle(TextInputStyle.Short).setPlaceholder('e.g: Ban, Kick, Timeout...').setRequired(true);
        const reasonField = new TextInputBuilder().setCustomId('appeal_reason')
            .setLabel('Why should we accept your appeal?')
            .setStyle(TextInputStyle.Paragraph).setPlaceholder('Explain your situation clearly...').setRequired(true);
        const extraField = new TextInputBuilder().setCustomId('appeal_extra')
            .setLabel('Any additional information? (Optional)')
            .setStyle(TextInputStyle.Paragraph).setPlaceholder('Extra details, evidence, context...').setRequired(false);
        modal.addComponents(
            new ActionRowBuilder().addComponents(actionField),
            new ActionRowBuilder().addComponents(reasonField),
            new ActionRowBuilder().addComponents(extraField)
        );
        return await interaction.showModal(modal);
    }

    // ── /edit ─────────────────────────────────────────────────
    if (commandName === 'edit') {
        const link      = options.getString('message_link');
        const linkParts = link.split('/');
        const chId      = linkParts[linkParts.length - 2];
        const msgId     = linkParts[linkParts.length - 1];
        try {
            const tc = await client.channels.fetch(chId).catch(() => null);
            if (!tc) return await interaction.reply({ content: '❌ Channel not found. Check the link.', ephemeral: true });
            const tm = await tc.messages.fetch(msgId).catch(() => null);
            if (!tm) return await interaction.reply({ content: '❌ Message not found. It may have been deleted.', ephemeral: true });
            const oldText = tm.embeds.length > 0 ? (tm.embeds[0].description || '') : (tm.content || '');
            const modal   = new ModalBuilder().setCustomId(`smart_edit_${chId}_${msgId}`).setTitle('Edit Message');
            const input   = new TextInputBuilder().setCustomId('updated_text').setLabel('New content:')
                .setStyle(TextInputStyle.Paragraph).setValue(oldText).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await interaction.showModal(modal);
        } catch (e) {
            console.error('❌ /edit error:', e);
            return await interaction.reply({ content: '❌ Message not found. Check the link.', ephemeral: true });
        }
    }

    // ── /setup-form ───────────────────────────────────────────
    if (commandName === 'setup-form') {
        const isAdmin = interaction.guild
            ? interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator)
            : interaction.user.id === CONFIG.OWNER_ID;
        if (!isAdmin) return await interaction.reply({ content: '❌ Administrator permission required.', ephemeral: true });
        const messageText   = options.getString('message_text');
        const isBox         = options.getBoolean('is_box');
        const btnName       = options.getString('btn_name');
        const btnColor      = options.getString('btn_color');
        const targetChannel = options.getChannel('target_channel');
        const resultIsBox   = options.getBoolean('result_is_box');
        const sendToDM      = options.getBoolean('send_to_dm') || false;
        const dmUser        = options.getUser('dm_user');
        const fields        = [];
        for (let i = 1; i <= 5; i++) { const fn = options.getString(`field_${i}_name`); if (fn) fields.push(fn); }
        const uniqueFormId  = `form_${Date.now()}`;
        formSettingsDB.set(uniqueFormId, { fields, resultIsBox, targetChannel: targetChannel.id });
        const btnColorMap = { 'Primary': ButtonStyle.Primary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger, 'Secondary': ButtonStyle.Secondary };
        const button      = new ButtonBuilder().setCustomId(uniqueFormId).setLabel(btnName).setStyle(btnColorMap[btnColor] || ButtonStyle.Primary);
        const row         = new ActionRowBuilder().addComponents(button);
        if (sendToDM) {
            if (!dmUser) return await interaction.reply({ content: '❌ Select a user in `dm_user` when `send_to_dm` is true.', ephemeral: true });
            try {
                const dmChannel = await dmUser.createDM();
                if (isBox) await dmChannel.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setDescription(messageText)], components: [row] });
                else await dmChannel.send({ content: messageText, components: [row] });
                return await interaction.reply({ content: `✅ Form button sent to **${dmUser.username}**'s DM! Results go to <#${targetChannel.id}>.`, ephemeral: true });
            } catch { return await interaction.reply({ content: `❌ Could not DM **${dmUser.username}**. They may have DMs disabled.`, ephemeral: true }); }
        }
        await interaction.reply({ content: '✅ Done! Message sent.', ephemeral: true });
        if (isBox) await interaction.channel.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setDescription(messageText)], components: [row] });
        else await interaction.channel.send({ content: messageText, components: [row] });
        return;
    }

    // Defer for remaining commands
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    try {
        const dbData       = await getDB(interaction.guild?.id || 'dm');
        const allowedRoleId = dbData.cmdPermissions.get(commandName);
        if (allowedRoleId && !interaction.member?.roles.cache.has(allowedRoleId) && !interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator))
            return await interaction.editReply({ content: `❌ Access Denied! This command requires the <@&${allowedRoleId}> role.` });

        // ── /ping ───────────────────────────────────────────────
        if (commandName === 'ping') return await interaction.editReply(`🏓 Pong! Latency: \`${client.ws.ping}ms\``);

        // ── /clear ─────────────────────────────────────────────
        if (commandName === 'clear') {
            const amount = options.getInteger('amount');
            const target = options.getString('target');

            if (target === 'everyone') {
                const everyoneBtn = new ButtonBuilder()
                    .setCustomId(`clear_everyone_${amount}_${channel.id}`)
                    .setLabel(`🌐 Delete ${amount} messages from everyone`)
                    .setStyle(ButtonStyle.Danger);
                return await interaction.editReply({
                    content: `⚠️ This will delete up to **${amount}** messages from **everyone** in this channel. Confirm?`,
                    components: [new ActionRowBuilder().addComponents(everyoneBtn)]
                });
            }

            if (target === 'select') {
                const userSelector = new UserSelectMenuBuilder()
                    .setCustomId(`clear_user_select_${amount}_${channel.id}`)
                    .setPlaceholder('☑️ Select the users whose messages to delete')
                    .setMinValues(1).setMaxValues(25);
                clearSessionStore.set(interaction.user.id, { amount, channelId: channel.id });
                return await interaction.editReply({
                    content: `☑️ Select the users whose messages you want to delete (scanning last **${amount}** messages):`,
                    components: [new ActionRowBuilder().addComponents(userSelector)]
                });
            }
        }

        // ── /send ───────────────────────────────────────────────
        if (commandName === 'send') {
            const msg     = options.getString('message');
            const style   = options.getString('style');
            const delay   = options.getInteger('delay_send');
            const delAfter = options.getInteger('delete_after');
            const color   = options.getString('color') || '#3498db';
            await interaction.editReply({ content: `✅ Message will be sent in ${delay} minute(s).` });
            setTimeout(async () => {
                let sent;
                if (style === 'embed') sent = await channel.send({ embeds: [new EmbedBuilder().setDescription(msg).setColor(color)] }).catch(() => {});
                else sent = await channel.send(msg).catch(() => {});
                if (sent && delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
            }, delay * 60000);
        }

        // ── /ads_set ────────────────────────────────────────────
        if (commandName === 'ads_set') {
            const name = options.getString('name');
            const data = { name, text: options.getString('text'), channelId: options.getChannel('channel').id, interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'), style: options.getString('style'), timer: null, lastMsgId: null };
            adsStorage.set(name, data);
            startAdLoop(name, guild.id);
            return await interaction.editReply({ content: `✅ Ad activated: **${name}**` });
        }

        // ── /ads_edit ───────────────────────────────────────────
        if (commandName === 'ads_edit') {
            const name = options.getString('name');
            const ad   = adsStorage.get(name);
            if (!ad) return await interaction.editReply({ content: '❌ Ad not found.' });
            if (options.getString('text')) ad.text = options.getString('text');
            if (options.getChannel('channel')) ad.channelId = options.getChannel('channel').id;
            if (options.getInteger('interval')) ad.interval = options.getInteger('interval');
            if (options.getInteger('delete') !== null) ad.deleteAfter = options.getInteger('delete');
            if (options.getString('style')) ad.style = options.getString('style');
            startAdLoop(name, guild.id);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stop_ad_${name}`).setLabel('Delete Ad 🗑️').setStyle(ButtonStyle.Danger));
            return await interaction.editReply({ content: `⚙️ Ad **${name}** updated.`, components: [row] });
        }

        // ── /role ───────────────────────────────────────────────
        if (commandName === 'role') {
            const targetRole = options.getRole('rank');
            const target     = options.getString('target');
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
                return await interaction.editReply({ content: "❌ You don't have permission to manage roles." });

            if (target === 'everyone') {
                const everyoneBtn = new ButtonBuilder()
                    .setCustomId(`role_everyone_${targetRole.id}`)
                    .setLabel(`🌐 Give @${targetRole.name} to all members`)
                    .setStyle(ButtonStyle.Success);
                const stopBtn = new ButtonBuilder()
                    .setCustomId('role_cancel')
                    .setLabel('Cancel ✖️')
                    .setStyle(ButtonStyle.Secondary);
                return await interaction.editReply({
                    content: `⚠️ This will assign **${targetRole.name}** to **all** members. Confirm?`,
                    components: [new ActionRowBuilder().addComponents(everyoneBtn, stopBtn)]
                });
            }

            if (target === 'select') {
                const userSelector = new UserSelectMenuBuilder()
                    .setCustomId(`role_user_select_${targetRole.id}`)
                    .setPlaceholder('☑️ Select the members to assign the role to')
                    .setMinValues(1).setMaxValues(25);
                roleSessionStore.set(interaction.user.id, { roleId: targetRole.id });
                return await interaction.editReply({
                    content: `☑️ Select the members you want to give **${targetRole.name}** to:`,
                    components: [new ActionRowBuilder().addComponents(userSelector)]
                });
            }
        }

        // ── /vote ───────────────────────────────────────────────
        if (commandName === 'vote') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger)
            );
            return await interaction.editReply({
                embeds: [new EmbedBuilder().setTitle('📊 New Vote').setDescription(options.getString('question')).setColor('#f1c40f')],
                components: [row]
            });
        }

        // ── /slash_control ──────────────────────────────────────
        if (commandName === 'slash_control') {
            const targetCmd = options.getString('command_name');
            const role      = options.getRole('allowed_role');
            dbData.cmdPermissions.set(targetCmd, role.id);
            await dbData.save();
            return await interaction.editReply({ content: `✅ Command \`/${targetCmd}\` is now restricted to <@&${role.id}>.` });
        }

        // ── /reaction ───────────────────────────────────────────
        if (commandName === 'reaction') {
            const subcommand = options.getSubcommand();
            if (subcommand === 'add') {
                const link      = options.getString('link');
                const emoji     = options.getString('emoji');
                const linkParts = link.split('/');
                const cId       = linkParts[linkParts.length - 2];
                const mId       = linkParts[linkParts.length - 1];
                try {
                    const tc = await guild.channels.fetch(cId);
                    const tm = await tc.messages.fetch(mId);
                    await tm.react(emoji);
                    return await interaction.editReply({ content: `✅ Reacted with ${emoji}!` });
                } catch {
                    return await interaction.editReply({ content: '❌ Failed. Make sure the link and emoji are valid.' });
                }
            }
            if (subcommand === 'remove') {
                const link      = options.getString('message_link');
                const linkParts = link.split('/');
                const cId       = linkParts[linkParts.length - 2];
                const mId       = linkParts[linkParts.length - 1];
                try {
                    const tc        = await client.channels.fetch(cId);
                    const tm        = await tc.messages.fetch(mId);
                    const reactions = tm.reactions.cache;
                    if (reactions.size === 0) return await interaction.editReply('❌ No reactions found on this message.');
                    const selectOptions = reactions.map(r => ({
                        label: `Remove ${r.emoji.name}`, description: `Count: ${r.count}`,
                        value: r.emoji.id || r.emoji.name,
                        emoji: r.emoji.id ? { id: r.emoji.id } : { name: r.emoji.name }
                    }));
                    const selector = new StringSelectMenuBuilder()
                        .setCustomId(`delete_reaction_${cId}_${mId}`)
                        .setPlaceholder('Choose the reaction to remove...')
                        .addOptions(selectOptions);
                    return await interaction.editReply({
                        content: '🔍 Select the reaction to remove:',
                        components: [new ActionRowBuilder().addComponents(selector)]
                    });
                } catch {
                    return await interaction.editReply({ content: '❌ Could not find message. Check link and permissions.' });
                }
            }
        }

        // ── /picture ────────────────────────────────────────────
        if (commandName === 'picture') {
            const image    = options.getAttachment('image');
            const style    = options.getString('style');
            const delay    = options.getInteger('delay_send');
            const delAfter = options.getInteger('delete_after');
            const caption  = options.getString('caption') || '';
            await interaction.editReply({ content: `✅ Picture scheduled — sending in ${delay} min, deleting after ${delAfter} min.` });
            setTimeout(async () => {
                let sent;
                if (style === 'embed') {
                    sent = await channel.send({ embeds: [new EmbedBuilder().setDescription(caption).setImage(image.url).setColor('#3498db').setTimestamp()] }).catch(() => {});
                } else {
                    sent = await channel.send({ content: caption, files: [image.url] }).catch(() => {});
                }
                if (sent && delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
            }, delay * 60000);
        }

        // ── /delete ─────────────────────────────────────────────
        if (commandName === 'delete') {
            const link      = options.getString('message_link');
            const parts     = link.split('/');
            const messageId = parts[parts.length - 1];
            const channelId = parts[parts.length - 2];
            try {
                const tc = await client.channels.fetch(channelId);
                const tm = await tc.messages.fetch(messageId);
                await tm.delete();
                await interaction.editReply({ content: '✅ Message deleted successfully!' });
            } catch (error) {
                let errorMessage = '❌ Could not delete the message.';
                if (error.code === 50013) errorMessage = "❌ Missing 'Manage Messages' permission.";
                if (error.code === 10008) errorMessage = '❌ Message not found. It may already be deleted.';
                if (error.code === 50005) errorMessage = "❌ Cannot delete someone else's DM message.";
                await interaction.editReply({ content: errorMessage });
            }
        }

        // ── /translate ──────────────────────────────────────────
        if (commandName === 'translate') {
            const res  = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${options.getString('to').toLowerCase()}&dt=t&q=${encodeURIComponent(options.getString('text'))}`);
            const json = await res.json();
            return await interaction.editReply({
                embeds: [new EmbedBuilder().setTitle('🌐 Translation').setDescription(json[0].map(i => i[0]).join('')).setColor('#4285F4')]
            });
        }

        // ── /dm ─────────────────────────────────────────────────
        if (commandName === 'dm') {
            const target         = options.getString('target');
            const style          = options.getString('style');
            const delay          = options.getInteger('delay_send');
            const delAfter       = options.getInteger('delete_after');
            const msgContent     = options.getString('message') || '';
            const caption        = options.getString('caption') || '';
            const image          = options.getAttachment('image');
            const color          = options.getString('color') || '#3498db';
            const reactionEmoji  = options.getString('reaction') || null;
            const repeatInterval = options.getInteger('repeat_interval') || 0;
            const showDeleteButton = options.getBoolean('delete_button') || false;

            if (!msgContent && !image)
                return await interaction.editReply({ content: '❌ You must provide a **message** or an **image**.' });

            if (repeatInterval > 0) {
                const adKey = `dmad_${Date.now()}`;
                dmAdsStorage.set(adKey, {
                    name: adKey, targetUserId: target === 'everyone' || target === 'everyone_exc' ? 'everyone' : 'select',
                    msgContent, caption, imageUrl: image?.url || null, style, color,
                    deleteAfter: delAfter, interval: repeatInterval, guildId: guild.id,
                    reactionEmoji: reactionEmoji || null, timer: null
                });
                startDMAdsLoop(adKey, guild.id);
                const stopRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`stop_dmad_${adKey}`).setLabel('Stop DM Ad 🗑️').setStyle(ButtonStyle.Danger)
                );
                return await interaction.editReply({
                    content: `✅ **DM Ad Activated!**\n⏱️ Repeating every **${repeatInterval}** min\n🗑️ Auto-delete after **${delAfter}** min${reactionEmoji ? `\n✨ Reaction: ${reactionEmoji}` : ''}`,
                    components: [stopRow]
                });
            }

            const settings = { style, delay, delAfter, msgContent, caption, imageUrl: image?.url || null, color, reactionEmoji, showDeleteButton };
            dmSettingsStorage.set(interaction.user.id, settings);

            if (target === 'select') {
                const userSelector = new UserSelectMenuBuilder()
                    .setCustomId('dm_target_select')
                    .setPlaceholder('☑️ Select the users to send the DM to')
                    .setMinValues(1).setMaxValues(25);
                return await interaction.editReply({
                    content: '☑️ **Select Users:** Pick the members you want to message:',
                    components: [new ActionRowBuilder().addComponents(userSelector)]
                });
            }

            if (target === 'everyone') {
                const sendAllBtn = new ButtonBuilder()
                    .setCustomId('dm_send_to_all').setLabel('✅ Send to All Members').setStyle(ButtonStyle.Success);
                return await interaction.editReply({
                    content: '🌐 **Everyone Mode:** Press the button to send to all members.',
                    components: [new ActionRowBuilder().addComponents(sendAllBtn)]
                });
            }

            if (target === 'everyone_exc') {
                const exceptionSelector = new UserSelectMenuBuilder()
                    .setCustomId('dm_exclude_select')
                    .setPlaceholder('🚫 Select users to EXCLUDE — DM will NOT be sent to them')
                    .setMinValues(1).setMaxValues(25);
                const sendAllBtn = new ButtonBuilder()
                    .setCustomId('dm_send_to_all').setLabel('Skip Exclusions — Send to All ✅').setStyle(ButtonStyle.Success);
                return await interaction.editReply({
                    content: '🚫 **Everyone Except:** Select the users you want to skip:',
                    components: [
                        new ActionRowBuilder().addComponents(exceptionSelector),
                        new ActionRowBuilder().addComponents(sendAllBtn)
                    ]
                });
            }
        }

    } catch (e) {
        console.error('❌ Command Error:', e);
        if (interaction.deferred) await interaction.editReply('❌ An error occurred.').catch(() => {});
    }
});

// ── Cancel Button ─────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'role_cancel') {
        roleSessionStore.delete(interaction.user.id);
        await interaction.update({ content: '✖️ Action cancelled.', components: [] });
    }
});

// ============================================================
// --- [JOIN/LEAVE] Member Events ---
// ============================================================
client.on('guildMemberAdd', async (member) => {
    if (protectionSettings.get('antiRaid')) {
        const guildId  = member.guild.id;
        const raidData = raidTracker.get(guildId) || { joins: [], locked: false };
        const now      = Date.now();
        raidData.joins = raidData.joins.filter(t => now - t < RAID_WINDOW);
        raidData.joins.push(now);
        raidTracker.set(guildId, raidData);
        if (raidData.joins.length >= RAID_THRESHOLD && !raidData.locked) {
            raidData.locked = true;
            raidTracker.set(guildId, raidData);
            const textChannels = member.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            for (const [, ch] of textChannels)
                await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => {});
            const logCh = member.guild.channels.cache.get(CONFIG.SUBMIT_LOG);
            if (logCh) {
                const raidEmbed = new EmbedBuilder()
                    .setTitle('🚨 RAID DETECTED — Server Locked')
                    .setDescription(`**Raid detected** — ${raidData.joins.length} members joined in less than ${RAID_WINDOW/1000} seconds!\nServer has been locked automatically. Use **/lockdown unlock** to unlock.`)
                    .setColor('#c0392b').setTimestamp();
                await logCh.send({ content: `<@${CONFIG.OWNER_ID}>`, embeds: [raidEmbed] });
            }
            recordSync('ANTI_RAID_LOCK', `Raid detected — ${raidData.joins.length} joins. Server locked.`);
            setTimeout(async () => {
                raidData.locked = false;
                raidTracker.set(guildId, raidData);
                const textChs = member.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
                for (const [, ch] of textChs)
                    await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: null }).catch(() => {});
            }, 5 * 60 * 1000);
        }
    }

    if (protectionSettings.get('newAccountProtection')) {
        const accountAge = Date.now() - member.user.createdTimestamp;
        if (accountAge < MIN_ACCOUNT_MS) {
            await member.kick('New account — less than 7 days old').catch(() => {});
            sendDetailedLog(member.guild, '🛡️ New Account Kicked',
                `<@${member.id}> was automatically kicked — account is less than **7 days old**.`, '#e67e22');
            recordSync('NEW_ACCOUNT_KICK', `User <@${member.id}> kicked — account too new.`);
            return;
        }
    }

    sendDetailedLog(member.guild, 'New Member Joined', `Member: <@${member.id}> joined the server.`, '#2ecc71');
    await member.roles.add([CONFIG.AUTO_ROLE, CONFIG.AUTO_ROLE_2]).catch(() => {});

    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeEmbed = new EmbedBuilder()
            .setDescription(
                `## **Welcome!**\n` +
                `[¡}================{!}================[¡}\n` +
                `- You are now from team PRO! 🥳\n` +
                `- Join us and you will be enjoying! 🎉\n` +
                `- Chat with us and go to read rules server.\n` +
                `[]--------------------!--------------------[]\n` +
                `→ <#1482874761951576228> | <#1482901664951304222>\n` +
                `[¡}================{!}================[¡}\n` +
                `Thank you! ❤️`)
            .setColor('#3498db').setTimestamp();
        const m = await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] }).catch(() => {});
        if (m) setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }

    await sendModDM(member.user, '🎉 Welcome to Pro Server!',
        `Hey **${member.user.username}**! 👋\nYou have successfully joined **Pro Server**. Enjoy your stay!`,
        member.guild.name);
    updateLiveInfo(member.guild);
});

client.on('guildMemberRemove', async (member) => {
    sendDetailedLog(member.guild, 'Member Left 👥', `User: **${member.user.tag}** (\`${member.user.id}\`) left the server.`, '#e74c3c');
    updateLiveInfo(member.guild);
});

// ============================================================
// --- [LIVE INFO] Update Info Channel ---
// ============================================================
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;
    const infoEmbed = new EmbedBuilder()
        .setTitle("📊 Pro Server Live Status")
        .setDescription(
            `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈|!]\n` +
            `Information about server:-\n` +
            `• Owner: <@${CONFIG.OWNER_ID}>\n` +
            `• Robot: <@${CONFIG.BOT_ID}>\n` +
            `• Server from: Egypt\n` +
            `• Date Server: 15/03/2026\n` +
            `• Total Members: ${guild.memberCount}\n` +
            `• **Latest Update:** ${extraServerInfo || "No recent updates."}\n` +
            `• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n` +
            `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`
        )
        .setColor('#3498db').setFooter({ text: "Last Radar Update" }).setTimestamp();
    try {
        const msgs = await infoCh.messages.fetch({ limit: 10 }).catch(() => null);
        if (msgs) msgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));
        await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
    } catch (e) { console.error(e); }
}

// ============================================================
// --- [AUTOMOD BADGE] Auto-create AutoMod rule on join ---
//
// HOW TO GET THE AUTOMOD BADGE:
// Discord awards the "AutoMod Power User" badge to bots that have
// created at least 1 AutoMod rule via the API across 10+ servers.
// This function runs automatically whenever the bot joins a new server.
// Requirements: bot needs MANAGE_GUILD permission.
// ============================================================
async function setupAutoModRule(guild) {
    try {
        const existingRules = await guild.autoModerationRules.fetch().catch(() => null);
        if (existingRules?.find(r => r.name === 'Pro Robot — Word Filter')) return;
        await guild.autoModerationRules.create({
            name: 'Pro Robot — Word Filter',
            eventType: 1,
            triggerType: 1,
            triggerMetadata: { keywordFilter: BAD_WORDS, regexPatterns: [] },
            actions: [{
                type: 1,
                metadata: { customMessage: '🚫 This message was blocked by Pro Robot AutoMod.' }
            }],
            enabled: true,
            reason: 'Pro Robot AutoMod integration'
        });
        console.log(`✅ AutoMod rule created in: ${guild.name}`);
        recordSync('AUTOMOD_RULE_CREATED', `AutoMod rule created in ${guild.name}`);
    } catch (err) {
        console.error(`❌ Failed to create AutoMod rule in ${guild.name}:`, err.message);
    }
}

client.on('guildCreate', async (guild) => {
    console.log(`✅ Joined new guild: ${guild.name}`);
    await setupAutoModRule(guild);
});

client.login(process.env.TOKEN);
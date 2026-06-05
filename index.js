const {
    Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder,
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle,
    UserSelectMenuBuilder, ContextMenuCommandBuilder, ApplicationCommandType,
    StringSelectMenuBuilder, PermissionFlagsBits
} = require('discord.js');
const express = require('express');
const fs      = require('fs'); // حفظ صلاحيات الأوامر بشكل دائم
const fetch   = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const app     = express();

app.get('/',       (req, res) => res.send('Pro Robot is Online! 🤖'));
app.get('/health', (req, res) => res.json({ status: 'ok', bot: 'Pro Robot', version: '7.5', uptime: process.uptime() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Keep-alive server running on port ${PORT}`));

const BOT_TOKEN = process.env.BOT_TOKEN || '';

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
        GatewayIntentBits.GuildWebhooks,    // مراقبة الـ Webhooks
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    presence: {
        status: 'online',
        activities: [{
            name: 'Custom Status',
            state: '🤖 | Version: 7.5',
            type: 4
        }]
    }
});

// ═══════════════════════════════════════════════════
// ⚙️  CONFIG — إعدادات السيرفر
// ═══════════════════════════════════════════════════
const CONFIG = {
    WELCOME_CH:   '1482881348204101768',
    AUTO_ROLE:    '1482883802186514615',
    AUTO_ROLE_2:  '1499510435639197887',
    OWNER_ID:     '1134146616857731173',
    BOT_ID:       '1495419259147386920',
    HELP_CH:      '1497909981725593712',
    SUBMIT_LOG:   '1494367980702797935', // قناة لوج كل أحداث السيرفر
    ROLE_CHANNEL: '1482874761951576228',
    INFO_CH:      '1484641160394702958',
    DM_LOG_CH:    '1502084414421729340', // قناة لوج الـ DMs
    BOOST_ROLE:   '1496789784524357703', // رتبة Booster
    GENERAL_CH:   '1482874761951576228', // قناة عامة
    NEWS_CH:      '1482934834899714048', // قناة أخبار السيرفر
};

const PUBLIC_COMMANDS = ['report', 'translate'];

// ═══════════════════════════════════════════════════
// 🗄️  STORAGE MAPS — تخزين البيانات
// ═══════════════════════════════════════════════════
const voteStore         = new Map();
const dmCommandSettings = new Map();
const adsStorage        = new Map();
const warnStorage       = new Map();
const dmAdsStorage      = new Map();
const dmSettingsStorage = new Map();
const formSettingsDB    = new Map();
const clearSessionStore = new Map();
const roleSessionStore  = new Map();
const reportImageStore  = new Map();
const cmdPermissions    = new Map();
const colorPickerStore  = new Map(); // تخزين إعدادات الأمر مؤقتاً عند اختيار لون Custom

const ADMIN_PASSWORD    = "Pro@Robot510";
let   extraServerInfo   = "";

// ═══════════════════════════════════════════════════
// 💾  PERSISTENT PERMISSIONS — حفظ صلاحيات الأوامر
// ═══════════════════════════════════════════════════
const PERMISSIONS_FILE = './cmd_permissions.json';

function loadPersistedPermissions() {
    try {
        if (fs.existsSync(PERMISSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
            for (const [cmd, roleId] of Object.entries(data)) cmdPermissions.set(cmd, roleId);
            console.log(`[PERMISSIONS] Loaded ${cmdPermissions.size} saved command restrictions.`);
        }
    } catch (e) { console.error('[PERMISSIONS] Load error:', e.message); }
}

function savePersistedPermissions() {
    try {
        const data = {};
        for (const [cmd, roleId] of cmdPermissions.entries()) data[cmd] = roleId;
        fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error('[PERMISSIONS] Save error:', e.message); }
}

loadPersistedPermissions(); // تحميل الصلاحيات عند بدء البوت

// ═══════════════════════════════════════════════════
// 🛡️  BOT SECURITY LAYER — Pro Robot Protection v7.5
// ═══════════════════════════════════════════════════

// Rate limiter — منع فلود الأوامر
const commandCooldowns   = new Map();
const COOLDOWN_MS        = 2000;  // 2 ثواني بين كل أمر
const COOLDOWN_MAX_CMDS  = 5;     // أقصى 5 أوامر في نافذة واحدة
const COOLDOWN_WINDOW_MS = 8000;  // نافذة 8 ثواني

// Mass-action tracker — كشف الإجراءات الجماعية المشبوهة
const massActionTracker = new Map();
const MASS_ACTION_LIMIT  = 4;     // أقصى 4 إجراءات متتالية (أكثر حساسية من v5)
const MASS_ACTION_WINDOW = 10000;

// Suspicious bot tracker — كشف البوتات الخطيرة
const suspiciousBotTracker  = new Map();
const SUSPICIOUS_BOT_NAMES  = ['pro hack', 'prohack', 'hack bot', 'raid', 'nuker', 'mass ban', 'token grabber'];
const SUSPICIOUS_BOT_PERMS  = ['Administrator', 'BanMembers', 'KickMembers', 'ManageChannels', 'ManageRoles', 'ManageWebhooks'];

// سجل أمان داخلي
const securityEventLog = [];
function logSecurityEvent(type, details) {
    securityEventLog.push({ time: new Date().toISOString(), type, details });
    if (securityEventLog.length > 500) securityEventLog.shift();
    console.warn(`[SECURITY v7.5] [${type}] ${details}`);
}

// فلترة المدخلات — منع حقن الأكواد والمحتوى الضار
function sanitizeInput(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/@everyone/gi, '@\u200beveryone')
        .replace(/@here/gi,     '@\u200bhere')
        .replace(/```/g,        '\`\`\`')
        .replace(/discord\.gg\//gi, 'discord[.]gg/')
        .slice(0, 2000);
}

// Rate limiter check
function checkRateLimit(userId, commandName) {
    const now = Date.now();
    if (!commandCooldowns.has(userId)) commandCooldowns.set(userId, []);
    const history = commandCooldowns.get(userId).filter(t => now - t < COOLDOWN_WINDOW_MS);
    history.push(now);
    commandCooldowns.set(userId, history);
    if (history.length > COOLDOWN_MAX_CMDS) {
        logSecurityEvent('RATE_LIMIT', `User ${userId} hit rate limit on /${commandName} (${history.length} cmds)`);
        return true;
    }
    return false;
}

// Mass-action detector
function detectMassAction(userId, actionType) {
    const now  = Date.now();
    const data = massActionTracker.get(userId) || { actions: [], warned: false };
    data.actions = data.actions.filter(a => now - a.time < MASS_ACTION_WINDOW);
    data.actions.push({ time: now, type: actionType });
    massActionTracker.set(userId, data);
    if (data.actions.length >= MASS_ACTION_LIMIT) {
        logSecurityEvent('MASS_ACTION', `User ${userId} triggered mass-action lock (${data.actions.length}x ${actionType})`);
        return true;
    }
    return false;
}

// Validate color hex
function validateHexColor(hex) {
    if (!hex) return '#3498db';
    const clean = hex.trim().startsWith('#') ? hex.trim() : '#' + hex.trim();
    return /^#[0-9A-Fa-f]{6}$/.test(clean) ? clean : '#3498db';
}

// Owner-only validation
function isOwner(userId) { return userId === CONFIG.OWNER_ID; }

const OWNER_ONLY_COMMANDS = new Set([
    'pro-robot', 'slash-control', 'setup-form', 'send', 'dm',
    'ad', 'dm-ad', 'clear', 'role', 'ping', 'sync', 'vpn',
    'ads-set', 'ads-edit', 'delete', 'edit', 'picture', 'reaction',
    'server-info', 'server-status', 'security-status', 'vote'
]);

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
    ['vpnProtection',        false],
    ['antiWebhook',          true],  // جديد — حماية من الـ Webhooks الخبيثة
    ['antiBot',              true],  // جديد — كشف البوتات الخطيرة
    ['antiTokenGrab',        true],  // جديد — منع سرقة التوكن
    ['sync',                 true]
]);

const syncLog = [];
let syncThursdayEnabled = true; // تفعيل السنك التلقائي كل خميس

function recordSync(action, details) {
    syncLog.push({ timestamp: new Date().toISOString(), action, details });
    if (syncLog.length > 200) syncLog.shift();
}

// ═══════════════════════════════════════════════════
// 📊  DM LOGGING — تسجيل الرسائل الخاصة
// ═══════════════════════════════════════════════════
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
                { name: 'Message Content', value: sanitizeInput(content) || '[Empty]', inline: false }
            )
            .setColor('#f1c40f').setTimestamp();
    } else if (type === 'IN_MEDIA') {
        logEmbed = new EmbedBuilder()
            .setTitle('🖼️ Private Media Detected')
            .addFields(
                { name: 'Sender', value: `<@${userId}>`,            inline: true },
                { name: 'Status', value: 'Attachment Received',     inline: true },
                { name: 'Note',   value: '(Image displayed below)', inline: false }
            )
            .setColor('#e67e22').setTimestamp();
        if (extraData.imageUrl) logEmbed.setImage(extraData.imageUrl);
    } else if (type === 'ALERT') {
        logEmbed = new EmbedBuilder()
            .setTitle('⚠️ DM System Alert')
            .addFields(
                { name: 'User',     value: `<@${userId}>`, inline: true },
                { name: 'Activity', value: sanitizeInput(content) || 'Multiple messages detected.', inline: false }
            )
            .setColor('#e74c3c').setTimestamp();
    } else {
        logEmbed = new EmbedBuilder()
            .setTitle('📤 DM Sent (Bot → User)')
            .addFields(
                { name: 'Target',  value: `<@${userId}>`, inline: true },
                { name: 'Content', value: sanitizeInput(content) || '[Empty]', inline: false }
            )
            .setColor('#2ecc71').setTimestamp();
    }
    await logCh.send({ embeds: [logEmbed] }).catch(() => {});
}

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
        console.error(`Failed to send mod DM to ${user.tag || user.username}:`, err.message);
    }
}

async function sendDetailedLog(guild, title, details, color = '#3498db') {
    if (!guild) return;
    const logChannel = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
    if (!logChannel) return;
    setTimeout(async () => {
        try {
            const fetchedLogs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
            const logEntry    = fetchedLogs?.entries.first();
            const executor    = logEntry ? `<@${logEntry.executor.id}>` : 'System / Unknown';
            const logEmbed    = new EmbedBuilder()
                .setTitle(`📡 RADAR: ${title}`)
                .setDescription(details)
                .addFields(
                    { name: '👤 Executor:', value: `**${executor}**`, inline: true },
                    { name: '📍 Location:', value: guild.name,        inline: true }
                )
                .setColor(color).setTimestamp();
            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        } catch (e) {
            console.error('sendDetailedLog error:', e.message);
        }
    }, 2000);
}

// ═══════════════════════════════════════════════════
// 🔍  SECURITY v7.5 — فحص البوتات الخبيثة
// ═══════════════════════════════════════════════════
async function checkSuspiciousBot(member, guild) {
    if (!member.user.bot) return false;
    if (!protectionSettings.get('antiBot')) return false;

    const botName    = (member.user.username || '').toLowerCase();
    const isSuspName = SUSPICIOUS_BOT_NAMES.some(n => botName.includes(n));

    // فحص اسم البوت
    if (isSuspName) {
        logSecurityEvent('SUSPICIOUS_BOT_NAME', `Bot "${member.user.username}" (${member.user.id}) has a suspicious name.`);
        try {
            await member.ban({ reason: 'Suspicious bot name — Pro Robot Security v7.5' }).catch(() => {});
            sendDetailedLog(guild, '🤖 Suspicious Bot Banned', `Bot **${member.user.username}** (\`${member.user.id}\`) was banned — suspicious name detected.\nPro Robot Security v7.5 blocked this threat.`, '#c0392b');
        } catch (e) { console.error('Bot ban error:', e.message); }
        return true;
    }

    // فحص الصلاحيات الخطيرة
    const botMember = guild.members.cache.get(member.id);
    if (botMember) {
        const dangerousPerms = SUSPICIOUS_BOT_PERMS.filter(p =>
            botMember.permissions.has(PermissionsBitField.Flags[p])
        );
        if (dangerousPerms.length >= 3) {
            logSecurityEvent('SUSPICIOUS_BOT_PERMS', `Bot "${member.user.username}" has dangerous perms: ${dangerousPerms.join(', ')}`);
            sendDetailedLog(guild, '⚠️ Suspicious Bot Detected',
                `Bot **${member.user.username}** (\`${member.user.id}\`) has dangerous permissions:\n**${dangerousPerms.join(', ')}**\n\nReview this bot immediately!`, '#e67e22');
            // نبعت تحذير للمالك
            const ownerUser = await client.users.fetch(CONFIG.OWNER_ID).catch(() => null);
            if (ownerUser) {
                await sendModDM(ownerUser, '⚠️ Suspicious Bot Alert',
                    `Bot **${member.user.username}** joined your server with dangerous permissions: **${dangerousPerms.join(', ')}**\n\nID: \`${member.user.id}\`\n\nReview and remove if unauthorized!`,
                    guild.name).catch(() => {});
            }
        }
    }
    return false;
}

// ═══════════════════════════════════════════════════
// 🔗  WEBHOOK PROTECTION — حماية من الـ Webhooks
// ═══════════════════════════════════════════════════
async function checkAndKillWebhooks(guild) {
    if (!protectionSettings.get('antiWebhook')) return;
    try {
        const webhooks = await guild.fetchWebhooks().catch(() => null);
        if (!webhooks) return;
        for (const [, webhook] of webhooks) {
            // حذف أي webhook غير معروف أو غير البوت
            if (webhook.owner?.id !== CONFIG.BOT_ID && webhook.owner?.id !== CONFIG.OWNER_ID) {
                await webhook.delete('Pro Robot Security — Unauthorized webhook detected').catch(() => {});
                logSecurityEvent('WEBHOOK_KILLED', `Deleted unauthorized webhook: ${webhook.name} in #${webhook.channel?.name}`);
                sendDetailedLog(guild, '🔗 Unauthorized Webhook Deleted',
                    `Webhook **${webhook.name}** was deleted.\nChannel: <#${webhook.channelId}>\nCreated by: ${webhook.owner ? `<@${webhook.owner.id}>` : 'Unknown'}`, '#e74c3c');
            }
        }
    } catch (e) { console.error('checkAndKillWebhooks error:', e.message); }
}

const BAD_WORDS        = ['word1', 'word2', 'word3'];
const inviteLinkRegex  = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/.+[a-z]/gi;
const generalLinkRegex = /(https?:\/\/[^\s]+)/gi;

// ═══════════════════════════════════════════════════
// 📨  DM PAYLOAD BUILDER
// ═══════════════════════════════════════════════════
const buildDMPayloadGlobal = (userId, settings) => {
    const { style, msgContent, caption, imageUrl, color, showDeleteButton, replyLink } = settings;
    const rowBtns = [];
    if (showDeleteButton) {
        rowBtns.push(
            new ButtonBuilder()
                .setCustomId(`delete_dm_${userId}`)
                .setLabel('Delete Message 🗑️')
                .setStyle(ButtonStyle.Danger)
        );
    }
    if (replyLink) {
        rowBtns.push(
            new ButtonBuilder()
                .setLabel('💬 View Message')
                .setStyle(ButtonStyle.Link)
                .setURL(replyLink)
        );
    }
    const components = rowBtns.length > 0 ? [new ActionRowBuilder().addComponents(rowBtns)] : [];
    if (style === 'embed') {
        const embed = new EmbedBuilder().setColor(validateHexColor(color)).setTimestamp();
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
        await logDMActivity(user.id, user.tag || user.username, settings.msgContent || settings.caption || '[Image Only]', 'OUT');
        if (settings.delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), settings.delAfter * 60000);
        return true;
    } catch (e) {
        console.error(`executeSmartSend failed for ${user.username}:`, e.message);
        return false;
    }
};

// ═══════════════════════════════════════════════════
// 📋  COMMANDS — تعريف الأوامر
// ═══════════════════════════════════════════════════
const commands = [
    new SlashCommandBuilder()
        .setName('ads-edit')
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
        .setName('ads-set')
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
        .setName('clear')
        .setDescription('Delete messages in this channel')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to scan (max 100)').setRequired(true))
        .addStringOption(o => o.setName('target').setDescription('Who to clear messages from').setRequired(true)
            .addChoices(
                { name: '🌐 Everyone  — delete all messages',      value: 'everyone' },
                { name: '☑️ Select Users — pick specific members', value: 'select'   }
            ))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete a message using its link')
        .addStringOption(o => o.setName('message_link').setDescription('Message link').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send DMs to members — supports reply button, images, and repeat ads')
        .addStringOption(o => o.setName('style').setDescription('Message style').setRequired(true)
            .addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal', value: 'normal' }))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Wait before sending (minutes, 0 = instant)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Auto-delete after (minutes, 0 = never)').setRequired(true))
        .addStringOption(o => o.setName('target').setDescription('Who to send the DM to').setRequired(true)
            .addChoices(
                { name: '☑️ Select Users — pick specific members', value: 'select'       },
                { name: '🌐 Everyone  — send to all members',      value: 'everyone'     },
                { name: '🚫 Everyone Except — choose exclusions',  value: 'everyone_exc' }
            ))
        .addStringOption(o => o.setName('message').setDescription('Message text').setRequired(false))
        .addAttachmentOption(o => o.setName('image').setDescription('Image to send').setRequired(false))
        .addStringOption(o => o.setName('caption').setDescription('Caption for the image').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('Embed color')
            .addChoices(
                { name: 'Blue',   value: '#3498db' }, { name: 'Red',    value: '#e74c3c' },
                { name: 'Green',  value: '#2ecc71' }, { name: 'Gold',   value: '#f1c40f' },
                { name: 'Purple', value: '#9b59b6' }, { name: 'Black',  value: '#2b2d31' },
                { name: '🎨 Custom — Type Hex Code', value: 'custom' } // اختيار اللون اليدوي
            ).setRequired(false))
        .addStringOption(o => o.setName('reply_to').setDescription('Add a "View Message" reply button — paste the full message link').setRequired(false))
        .addIntegerOption(o => o.setName('repeat_interval').setDescription('Repeat every X minutes (0 = no repeat)').setRequired(false))
        .addStringOption(o => o.setName('reaction').setDescription('Auto-react emoji on DM').setRequired(false))
        .addBooleanOption(o => o.setName('delete_button').setDescription('Show delete button to recipient').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('edit')
        .setDescription('Edit a previously sent bot message')
        .addStringOption(o => o.setName('message_link').setDescription('Full message link').setRequired(true))
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

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('pro-robot')
        .setDescription('Pro Robot — لوحة التحكم الكاملة')
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('Full dashboard: bot info, server stats, security, warns, ads, and more')
        )
        .addSubcommand(sub => sub
            .setName('security')
            .setDescription('Enable or disable any protection system')
            .addStringOption(o => o.setName('protection').setDescription('Which protection to toggle').setRequired(true)
                .addChoices(
                    { name: '🛡️ Anti-Spam',              value: 'antiSpam'             },
                    { name: '🚨 Anti-Raid',              value: 'antiRaid'             },
                    { name: '🔗 Anti-Link',              value: 'antiLink'             },
                    { name: '🔤 Anti-Caps',              value: 'antiCaps'             },
                    { name: '📢 Anti-Mass-Mention',      value: 'antiMassMention'      },
                    { name: '🤬 Anti-Bad-Word',          value: 'antiBadWord'          },
                    { name: '👶 New Account Protection', value: 'newAccountProtection' },
                    { name: '🌐 VPN Protection',         value: 'vpnProtection'        },
                    { name: '🔗 Anti-Webhook',           value: 'antiWebhook'          },
                    { name: '🤖 Anti-Suspicious-Bot',    value: 'antiBot'              },
                    { name: '🛡️ Anti-Token-Grab',        value: 'antiTokenGrab'        },
                    { name: '🔄 Sync System',            value: 'sync'                 }
                )
            )
            .addStringOption(o => o.setName('action').setDescription('Enable or disable').setRequired(true)
                .addChoices(
                    { name: '✅ Enable',  value: 'enable'  },
                    { name: '❌ Disable', value: 'disable' }
                )
            )
        )
        .addSubcommand(sub => sub
            .setName('presence')
            .setDescription('Set bot online presence or restart bot connection')
            .addStringOption(o => o.setName('mode').setDescription('Bot presence mode').setRequired(true)
                .addChoices(
                    { name: '🟢 Online',               value: 'online'    },
                    { name: '🌙 Idle (Moon Icon)',      value: 'idle'      },
                    { name: '⚫ Invisible (Offline)',   value: 'invisible' },
                    { name: '🔴 Do Not Disturb',        value: 'dnd'       },
                    { name: '🔄 Restart Bot Connection', value: 'restart'  } // إعادة تشغيل البوت
                )
            )
        )
        .addSubcommand(sub => sub
            .setName('lockdown')
            .setDescription('Lock or unlock all server channels')
            .addStringOption(o => o.setName('action').setDescription('Lock or unlock the server').setRequired(true)
                .addChoices(
                    { name: '🔒 Lock Server',   value: 'lock'   },
                    { name: '🔓 Unlock Server', value: 'unlock' }
                )
            )
            .addStringOption(o => o.setName('reason').setDescription('Reason (optional)').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('monitor-clear')
            .setDescription('Clear monitoring data — warns, sessions, or all data')
            .addStringOption(o => o.setName('target').setDescription('What to clear').setRequired(true)
                .addChoices(
                    { name: '⚠️ Clear Warns — specific user',     value: 'warns_user' },
                    { name: '⚠️ Clear Warns — all users',         value: 'warns_all'  },
                    { name: '🧹 Clear Sessions (DM/Role/Clear)',   value: 'sessions'   },
                    { name: '🔄 Reset Everything',                 value: 'reset_all'  }
                )
            )
            .addUserOption(o => o.setName('user').setDescription('User to clear (for warns_user only)').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('channel-info')
            .setDescription('Get detailed info about any channel')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to inspect').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('member-info')
            .setDescription('Get detailed info about any member')
            .addUserOption(o => o.setName('user').setDescription('Member to inspect').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('warns')
            .setDescription('View warns for a specific member or all members')
            .addUserOption(o => o.setName('user').setDescription('Member to view warns for (leave empty for all)').setRequired(false))
        )
        // ✅ channel-info & member-info are PUBLIC — admin check done in code for other subs
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('reaction')
        .setDescription('Manage reactions on messages')
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a reaction to a message')
            .addStringOption(o => o.setName('link').setDescription('Message link').setRequired(true))
            .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove a reaction from a message')
            .addStringOption(o => o.setName('message_link').setDescription('Message link').setRequired(true))
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('report')
        .setDescription('Submit a report about anything in the server')
        .addAttachmentOption(o => o.setName('image').setDescription('Optional: attach an image to support your report').setRequired(false)),
        // ✅ PUBLIC — visible to everyone in server & DM

    new SlashCommandBuilder()
        .setName('role')
        .setDescription('Give or remove a role from one or more members')
        .addRoleOption(o => o.setName('rank').setDescription('The role to assign or remove').setRequired(true))
        .addStringOption(o => o.setName('action').setDescription('Give or remove the role').setRequired(true)
            .addChoices(
                { name: '✅ Give Role',   value: 'give'   },
                { name: '❌ Remove Role', value: 'remove' }
            ))
        .addStringOption(o => o.setName('target').setDescription('Who to apply this to').setRequired(true)
            .addChoices(
                { name: '☑️ Select Users — pick specific members', value: 'select'   },
                { name: '🌐 Everyone  — apply to all members',     value: 'everyone' }
            ))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('security-status')
        .setDescription('View the status of all protection systems')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('send')
        .setDescription('Send a custom message with a timer — supports reply to existing messages')
        .addStringOption(o => o.setName('message').setDescription('Message content').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Message style').setRequired(true)
            .addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal', value: 'normal' }))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Wait before sending (minutes)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Auto-delete after (minutes)').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Box color')
            .addChoices(
                { name: 'Blue',   value: '#3498db' }, { name: 'Red',    value: '#e74c3c' },
                { name: 'Green',  value: '#2ecc71' }, { name: 'Gold',   value: '#f1c40f' },
                { name: 'Purple', value: '#9b59b6' }, { name: 'Black',  value: '#2b2d31' },
                { name: '🎨 Custom — Type Hex Code', value: 'custom' } // اختيار اللون اليدوي
            ))
        .addStringOption(o => o.setName('reply_to').setDescription('Reply to a message — paste the full message link').setRequired(false))
        .addChannelOption(o => o.setName('target_channel').setDescription('Send to a specific channel (default: current channel)').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('server-info')
        .setDescription('View information about this server'),
        // ✅ PUBLIC — visible to everyone in server & DM

    new SlashCommandBuilder()
        .setName('server-status')
        .setDescription('Get a full private status report of the server')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('setup-form')
        .setDescription('Create a custom form with up to 3 buttons')
        .addStringOption(o => o.setName('message_text').setDescription('Text above the buttons').setRequired(true))
        .addBooleanOption(o => o.setName('is_box').setDescription('Send as Embed?').setRequired(true))
        .addStringOption(o => o.setName('btn1_name').setDescription('Button 1 label').setRequired(true))
        .addStringOption(o => o.setName('btn1_color').setDescription('Button 1 color').setRequired(true)
            .addChoices(
                { name: 'Blue',  value: 'Primary'   }, { name: 'Green', value: 'Success'   },
                { name: 'Red',   value: 'Danger'    }, { name: 'Grey',  value: 'Secondary' }
            ))
        .addChannelOption(o => o.setName('target_channel').setDescription('Where results are sent').setRequired(true))
        .addStringOption(o => o.setName('field_1_name').setDescription('Field 1 label').setRequired(true))
        .addBooleanOption(o => o.setName('result_is_box').setDescription('Send result as Embed?').setRequired(true))
        .addStringOption(o => o.setName('embed_color').setDescription('Embed color (for box style)').setRequired(false)
            .addChoices(
                { name: 'Blue',   value: '#3498db' }, { name: 'Red',    value: '#e74c3c' },
                { name: 'Green',  value: '#2ecc71' }, { name: 'Gold',   value: '#f1c40f' },
                { name: 'Purple', value: '#9b59b6' }, { name: 'Black',  value: '#2b2d31' },
                { name: '🎨 Custom — Type Hex Code', value: 'custom' }
            ))
        .addStringOption(o => o.setName('field_2_name').setDescription('Field 2 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('field_3_name').setDescription('Field 3 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('field_4_name').setDescription('Field 4 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('field_5_name').setDescription('Field 5 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('btn2_name').setDescription('Button 2 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('btn2_color').setDescription('Button 2 color').setRequired(false)
            .addChoices(
                { name: 'Blue',  value: 'Primary'   }, { name: 'Green', value: 'Success'   },
                { name: 'Red',   value: 'Danger'    }, { name: 'Grey',  value: 'Secondary' }
            ))
        .addStringOption(o => o.setName('btn3_name').setDescription('Button 3 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('btn3_color').setDescription('Button 3 color').setRequired(false)
            .addChoices(
                { name: 'Blue',  value: 'Primary'   }, { name: 'Green', value: 'Success'   },
                { name: 'Red',   value: 'Danger'    }, { name: 'Grey',  value: 'Secondary' }
            ))
        .addBooleanOption(o => o.setName('send_to_dm').setDescription('Send button via DM?').setRequired(false))
        .addUserOption(o => o.setName('dm_user').setDescription('User to send DM to').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('slash-control')
        .setDescription('Manage command access — restrict to role, remove restriction, or toggle DM')
        .addStringOption(o => o.setName('command_name').setDescription('Command to manage').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('action').setDescription('What to do with this command').setRequired(true)
            .addChoices(
                { name: '🔒 Restrict to Role',    value: 'restrict'   },
                { name: '🔓 Remove Restriction',  value: 'remove'     },
                { name: '💬 Allow in DMs',        value: 'dm_enable'  },
                { name: '🚫 Disable in DMs',      value: 'dm_disable' }
            ))
        .addRoleOption(o => o.setName('allowed_role').setDescription('Role allowed to use it (for restrict only)').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Sync the bot — catch up missed actions (auto-roles, welcome, etc.)')
        .addStringOption(o => o.setName('action').setDescription('What to do').setRequired(true)
            .addChoices(
                { name: '🔄 Run Sync Now',           value: 'run'     },
                { name: '📋 View Sync Log',          value: 'log'     },
                { name: '✅ Enable Auto-Sync',        value: 'enable'  },
                { name: '❌ Disable Auto-Sync',       value: 'disable' }
            ))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate text to any language')
        .addStringOption(o => o.setName('text').setDescription('Text to translate').setRequired(true))
        .addStringOption(o => o.setName('to').setDescription('Target language code (e.g: ar, en, fr)').setRequired(true)),
        // ✅ PUBLIC — visible to everyone in server & DM

    new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Create a custom vote with up to 5 buttons')
        .addStringOption(o => o.setName('question').setDescription('Vote question').setRequired(true))
        .addStringOption(o => o.setName('embed_color').setDescription('Embed color for the vote').setRequired(false)
            .addChoices(
                { name: 'Gold (Default)', value: '#f1c40f' }, { name: 'Blue',   value: '#3498db' },
                { name: 'Green',          value: '#2ecc71' }, { name: 'Red',    value: '#e74c3c' },
                { name: 'Purple',         value: '#9b59b6' }, { name: 'Black',  value: '#2b2d31' },
                { name: '🎨 Custom — Type Hex Code', value: 'custom' }
            ))
        .addStringOption(o => o.setName('btn1_label').setDescription('Button 1 label (default: Yes ✅)').setRequired(false))
        .addStringOption(o => o.setName('btn1_color').setDescription('Button 1 color (default: Green)').setRequired(false)
            .addChoices(
                { name: 'Green', value: 'Success' }, { name: 'Red',  value: 'Danger'    },
                { name: 'Blue',  value: 'Primary' }, { name: 'Grey', value: 'Secondary' }
            ))
        .addStringOption(o => o.setName('btn2_label').setDescription('Button 2 label (default: No ❌)').setRequired(false))
        .addStringOption(o => o.setName('btn2_color').setDescription('Button 2 color (default: Red)').setRequired(false)
            .addChoices(
                { name: 'Green', value: 'Success' }, { name: 'Red',  value: 'Danger'    },
                { name: 'Blue',  value: 'Primary' }, { name: 'Grey', value: 'Secondary' }
            ))
        .addStringOption(o => o.setName('btn3_label').setDescription('Button 3 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('btn3_color').setDescription('Button 3 color').setRequired(false)
            .addChoices(
                { name: 'Green', value: 'Success' }, { name: 'Red',  value: 'Danger'    },
                { name: 'Blue',  value: 'Primary' }, { name: 'Grey', value: 'Secondary' }
            ))
        .addStringOption(o => o.setName('btn4_label').setDescription('Button 4 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('btn4_color').setDescription('Button 4 color').setRequired(false)
            .addChoices(
                { name: 'Green', value: 'Success' }, { name: 'Red',  value: 'Danger'    },
                { name: 'Blue',  value: 'Primary' }, { name: 'Grey', value: 'Secondary' }
            ))
        .addStringOption(o => o.setName('btn5_label').setDescription('Button 5 label (optional)').setRequired(false))
        .addStringOption(o => o.setName('btn5_color').setDescription('Button 5 color').setRequired(false)
            .addChoices(
                { name: 'Green', value: 'Success' }, { name: 'Red',  value: 'Danger'    },
                { name: 'Blue',  value: 'Primary' }, { name: 'Grey', value: 'Secondary' }
            ))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('vpn')
        .setDescription('Toggle VPN protection — auto-ban members detected using a VPN')
        .addStringOption(o => o.setName('status').setDescription('Enable or disable VPN protection').setRequired(true)
            .addChoices(
                { name: '✅ Enable',  value: 'enable'  },
                { name: '❌ Disable', value: 'disable' }
            ))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),

    // ── CONTEXT MENU (Apps right-click) — hidden from everyone; only server owner sees them ──
    new ContextMenuCommandBuilder()
        .setName('Add Reaction')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(0)
        .setDMPermission(false),

    new ContextMenuCommandBuilder()
        .setName('Delete Message')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(0)
        .setDMPermission(false),

    new ContextMenuCommandBuilder()
        .setName('Edit Message')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(0)
        .setDMPermission(false),

    new ContextMenuCommandBuilder()
        .setName('Remove Reaction')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(0)
        .setDMPermission(false),

    new ContextMenuCommandBuilder()
        .setName('Translate Message')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(0)
        .setDMPermission(false),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

// ═══════════════════════════════════════════════════
// 🌐  VPN CHECK — فحص VPN
// ═══════════════════════════════════════════════════
async function checkVPN(ip) {
    try {
        const res  = await fetch(`http://ip-api.com/json/${ip}?fields=proxy,hosting,query`);
        const data = await res.json();
        return data.proxy === true || data.hosting === true;
    } catch { return false; }
}

// ═══════════════════════════════════════════════════
// 📢  AD LOOPS — حلقات الإعلانات
// ═══════════════════════════════════════════════════
function startAdLoop(adName, guildId) {
    const ad = adsStorage.get(adName);
    if (!ad) return;
    if (ad.timer) clearInterval(ad.timer);
    ad.timer = setInterval(async () => {
        try {
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
        } catch (e) { console.error('Ad loop error:', e.message); }
    }, ad.interval * 60000);
}

function startDMAdsLoop(adName, guildId) {
    const ad = dmAdsStorage.get(adName);
    if (!ad) return;
    if (ad.timer) clearInterval(ad.timer);
    ad.timer = setInterval(async () => {
        try {
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
                    const embed = new EmbedBuilder().setColor(validateHexColor(ad.color)).setTimestamp();
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
                    await logDMActivity(user.id, user.tag || user.username, ad.msgContent || '[Image]', 'OUT');
                    if (ad.deleteAfter > 0) setTimeout(() => sent.delete().catch(() => {}), ad.deleteAfter * 60000);
                } catch (e) { console.error(`DM Ad failed for ${user.username}:`, e.message); }
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
        } catch (e) { console.error('DM Ads loop error:', e.message); }
    }, ad.interval * 60000);
}

// ═══════════════════════════════════════════════════
// 🔄  SYNC — نظام المزامنة التلقائية
// ═══════════════════════════════════════════════════
async function runAutoSync(guild) {
    if (!protectionSettings.get('sync')) return;
    if (!guild) guild = client.guilds.cache.first();
    if (!guild) return;

    const syncResults = [];
    recordSync('AUTO_SYNC_START', `Auto sync started in ${guild.name}`);

    try {
        // ① فحص الـ Auto-Roles — لو أي عضو مش عنده الرتبة التلقائية
        const members = await guild.members.fetch().catch(() => null);
        if (members) {
            let fixedRoles = 0;
            for (const [, member] of members) {
                if (member.user.bot) continue;
                const missingRole1 = !member.roles.cache.has(CONFIG.AUTO_ROLE);
                const missingRole2 = !member.roles.cache.has(CONFIG.AUTO_ROLE_2);
                if (missingRole1 || missingRole2) {
                    const rolesToAdd = [];
                    if (missingRole1) rolesToAdd.push(CONFIG.AUTO_ROLE);
                    if (missingRole2) rolesToAdd.push(CONFIG.AUTO_ROLE_2);
                    await member.roles.add(rolesToAdd).catch(() => {});
                    fixedRoles++;
                    await new Promise(r => setTimeout(r, 300)); // delay بين كل عملية
                }
            }
            syncResults.push(fixedRoles > 0
                ? `✅ Fixed auto-roles for **${fixedRoles}** member(s).`
                : `✅ All members have correct auto-roles.`);
            recordSync('SYNC_ROLES', `Fixed auto-roles for ${fixedRoles} members.`);
        }

        // ② فحص صلاحيات البوت
        const botMember     = guild.members.me;
        const requiredPerms = ['KickMembers', 'BanMembers', 'ManageMessages', 'ModerateMembers', 'ViewChannel', 'SendMessages', 'ManageRoles'];
        const missingPerms  = botMember ? requiredPerms.filter(p => !botMember.permissions.has(PermissionsBitField.Flags[p])) : requiredPerms;
        syncResults.push(missingPerms.length > 0
            ? `⚠️ Missing permissions: **${missingPerms.join(', ')}**`
            : `✅ All required permissions are intact.`);

        // ③ فحص قناة اللوج
        const logCh = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
        syncResults.push(logCh ? `✅ Log channel accessible: <#${CONFIG.SUBMIT_LOG}>` : `⚠️ Log channel not found!`);

        // ④ عدد الأنظمة المفعلة
        const activeProtections = Array.from(protectionSettings.entries()).filter(([, v]) => v).length;
        syncResults.push(`✅ Active protections: **${activeProtections}/${protectionSettings.size}**`);

        // ⑤ عدد الإعلانات النشطة
        const activeAds = Array.from(adsStorage.values()).filter(a => a.timer).length;
        syncResults.push(`✅ Active ad loops: **${activeAds}**`);

        // ⑥ فحص الـ Webhooks
        if (protectionSettings.get('antiWebhook')) await checkAndKillWebhooks(guild);
        syncResults.push(`✅ Webhook check complete.`);

        recordSync('AUTO_SYNC_DONE', `Sync finished — ${syncResults.length} checks passed.`);

        // إرسال تقرير السنك لقناة اللوج
        if (logCh) {
            await logCh.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🔄 Auto-Sync Completed')
                    .setDescription(syncResults.join('\n'))
                    .setColor('#3498db')
                    .setFooter({ text: 'Pro Robot Auto-Sync v7.5' })
                    .setTimestamp()]
            }).catch(() => {});
        }
    } catch (e) {
        console.error('runAutoSync error:', e.message);
        recordSync('SYNC_ERROR', e.message);
    }
    return syncResults;
}

// ═══════════════════════════════════════════════════
// 👥  GUILD MEMBER EVENTS — أحداث الأعضاء
// ═══════════════════════════════════════════════════
client.on('guildUpdate', (oldGuild, newGuild) => {
    if (oldGuild.name !== newGuild.name)
        sendDetailedLog(newGuild, 'Server Name Changed', `From **${oldGuild.name}** to **${newGuild.name}**`, '#e67e22');
    if (oldGuild.icon !== newGuild.icon)
        sendDetailedLog(newGuild, 'Server Icon Changed', 'Server avatar has been updated.', '#9b59b6');
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        // ── BOOST SYSTEM — نظام البوست المحسن ──
        if (!oldMember.premiumSince && newMember.premiumSince) {
            // إعطاء رتبة البوست
            await newMember.roles.add(CONFIG.BOOST_ROLE).catch(err => console.error('Boost role error:', err.message));

            // رسالة قناة الأخبار (news channel) — نفس الـ style
            const newsChannel = newMember.guild.channels.cache.get(CONFIG.NEWS_CH);
            if (newsChannel) {
                const newsEmbed = new EmbedBuilder()
                    .setTitle('💎 Server Boost!')
                    .setDescription(
                        `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈|!]\n` +
                        `🎉 Thank you <@${newMember.id}> for boosting **${newMember.guild.name}**!\n` +
                        `💎 You now have <@&${CONFIG.BOOST_ROLE}> rank!\n` +
                        `- Your support means the world to us ❤️\n` +
                        `- You help make the server even better! 🚀\n` +
                        `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`
                    )
                    .setColor('#ffff55')
                    .setThumbnail(newMember.user.displayAvatarURL({ size: 256 }))
                    .setTimestamp()
                    .setFooter({ text: 'Pro Robot • Pro Server' });
                const newsMsg = await newsChannel.send({ content: `@everyone`, embeds: [newsEmbed] }).catch(() => null);
                if (newsMsg) await newsMsg.react('🎉').catch(() => {});
            }

            // رسالة DM شكر للـ booster — نفس الـ style
            try {
                const dmChannel = await newMember.user.createDM();
                const dmEmbed = new EmbedBuilder()
                    .setTitle('💎 Thank you for Boosting!')
                    .setDescription(
                        `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈|!]\n` +
                        `Hey **${newMember.user.username}**! 👋\n\n` +
                        `Thank you so much for boosting **${newMember.guild.name}**! 💎\n` +
                        `Your support helps us grow and improve the server for everyone.\n\n` +
                        `• You have been assigned: <@&${CONFIG.BOOST_ROLE}>\n` +
                        `• We truly appreciate you! ❤️\n\n` +
                        `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`
                    )
                    .setColor('#ffff55')
                    .setTimestamp()
                    .setFooter({ text: 'Pro Robot Security System • Pro Server' });
                await dmChannel.send({ embeds: [dmEmbed] });
                await logDMActivity(newMember.user.id, newMember.user.tag, '[BOOST THANK YOU] Boost DM sent.', 'OUT');
            } catch (e) { console.error('Boost DM error:', e.message); }

            sendDetailedLog(newMember.guild, 'Server Boosted! 💎',
                `User: <@${newMember.id}> has just boosted the server.\nStatus: **Boost Role Assigned Successfully ✅**`, '#ffff55');
        }

        // ── TIMEOUT ──
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
        if (addedRoles.size > 0)   sendDetailedLog(newMember.guild, 'Role Added',   `Role <@&${addedRoles.first().id}> added to <@${newMember.id}>`,      '#2ecc71');
        if (removedRoles.size > 0) sendDetailedLog(newMember.guild, 'Role Removed', `Role <@&${removedRoles.first().id}> removed from <@${newMember.id}>`, '#e74c3c');
    } catch (e) { console.error('guildMemberUpdate error:', e.message); }
});

client.on('channelCreate', ch => { if (ch.guild) sendDetailedLog(ch.guild, 'Channel Created', `Name: **${ch.name}** (Type: ${ch.type})\nID: \`${ch.id}\``, '#2ecc71'); });
client.on('channelDelete', ch => { if (ch.guild) sendDetailedLog(ch.guild, 'Channel Deleted', `Name: **${ch.name}**\nID: \`${ch.id}\``, '#e74c3c'); });
client.on('channelUpdate', (oldCh, newCh) => {
    if (newCh.guild && oldCh.name !== newCh.name)
        sendDetailedLog(newCh.guild, 'Channel Name Updated 📝',
            `Channel: <#${newCh.id}>\nOld: \`${oldCh.name}\`\nNew: \`${newCh.name}\``, '#3498db');
});

client.on('roleCreate', role => { if (role.guild) sendDetailedLog(role.guild, 'Role Created', `Role: **${role.name}**\nID: \`${role.id}\``, '#2ecc71'); });
client.on('roleDelete', role => { if (role.guild) sendDetailedLog(role.guild, 'Role Deleted', `Role: **${role.name}**\nID: \`${role.id}\``, '#e74c3c'); });
client.on('roleUpdate', (oldRole, newRole) => {
    if (newRole.guild && oldRole.name !== newRole.name)
        sendDetailedLog(newRole.guild, 'Role Name Updated ⚙️',
            `Role ID: \`${newRole.id}\`\nOld: \`${oldRole.name}\`\nNew: \`${newRole.name}\``, '#3498db');
});

client.on('guildBanAdd', async ban => {
    try {
        await sendModDM(ban.user, '🚫 Permanent Ban',
            `You have been permanently banned from **${ban.guild.name}**.\nReason: ${ban.reason || 'Violation of server rules.'}`,
            ban.guild.name);
        sendDetailedLog(ban.guild, 'Member Banned 🚫',
            `User: **${ban.user.tag || ban.user.username}** (\`${ban.user.id}\`) was banned.\nReason: \`${ban.reason || 'No reason specified'}\``, '#c0392b');
    } catch (e) { console.error('guildBanAdd error:', e.message); }
});

client.on('guildBanRemove', ban => {
    sendDetailedLog(ban.guild, 'Member Unbanned 🔓',
        `User: **${ban.user.tag || ban.user.username}** (\`${ban.user.id}\`) has been unbanned.`, '#2ecc71');
});

client.on('voiceStateUpdate', (oldState, newState) => {
    try {
        const member = newState.member;
        const guild  = newState.guild;
        if (!member || !guild) return;
        if (!oldState.channelId && newState.channelId)
            sendDetailedLog(guild, 'Voice Join',  `👤 <@${member.id}> joined: **${guild.channels.cache.get(newState.channelId)?.name}**`, '#2ecc71');
        if (oldState.channelId && !newState.channelId)
            sendDetailedLog(guild, 'Voice Leave', `👤 <@${member.id}> left: **${guild.channels.cache.get(oldState.channelId)?.name}**`,   '#e74c3c');
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId)
            sendDetailedLog(guild, 'Voice Move',
                `👤 <@${member.id}> moved from **${guild.channels.cache.get(oldState.channelId)?.name}** to **${guild.channels.cache.get(newState.channelId)?.name}**`, '#f1c40f');
    } catch (e) { console.error('voiceStateUpdate error:', e.message); }
});

client.on('messageDelete', message => {
    if (!message.author || message.author.bot || !message.guild) return;
    sendDetailedLog(message.guild, 'Message Deleted',
        `🗑️ Message by <@${message.author.id}> in <#${message.channel.id}>:\n**Content:** ${message.content || 'Empty/Image'}`, '#e74c3c');
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!oldMessage.author || oldMessage.author.bot || oldMessage.content === newMessage.content) return;
    if (!oldMessage.guild) return;
    sendDetailedLog(oldMessage.guild, 'Message Edited',
        `📝 <@${oldMessage.author.id}> edited in <#${oldMessage.channel.id}>:\n**Old:** ${oldMessage.content}\n**New:** ${newMessage.content}`, '#3498db');
});

// مراقبة إنشاء / حذف الـ Webhooks
client.on('webhookUpdate', async channel => {
    if (!channel.guild) return;
    sendDetailedLog(channel.guild, '🔗 Webhook Activity Detected',
        `Webhook change in: <#${channel.id}>\nRunning security check...`, '#e67e22');
    await checkAndKillWebhooks(channel.guild);
});

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot) return;
        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (reaction.message.channel.type === ChannelType.DM) {
            await logDMActivity(user.id, user.tag || user.username,
                `✨ User reacted with **${reaction.emoji.name}** to DM message (ID: ${reaction.message.id})`, 'ALERT');
        }
    } catch (e) { console.error('messageReactionAdd error:', e.message); }
});

// ═══════════════════════════════════════════════════
// ✅  READY — البوت جاهز
// ═══════════════════════════════════════════════════
client.on('ready', async () => {
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash Commands Registered Successfully! (Pro Robot v7.5)');
    } catch (e) { console.error('Error registering slash commands:', e.message); }
    console.log(`Logged in as ${client.user.tag} — Pro Robot v7.5`);
    if (protectionSettings.get('sync')) recordSync('BOT_READY', `Bot v7.5 started at ${new Date().toISOString()}`);
    updateLiveInfo();

    // ── 💎 NITRO FEATURES: Log external emoji / sticker support status ──
    for (const [, guild] of client.guilds.cache) {
        try {
            const botMember = guild.members.me;
            if (!botMember) continue;
            const canExtEmoji    = botMember.permissions.has(PermissionsBitField.Flags.UseExternalEmojis,   true);
            const canExtStickers = botMember.permissions.has(PermissionsBitField.Flags.UseExternalStickers, true);
            console.log(`[NITRO] ${guild.name} — ExternalEmoji:${canExtEmoji} ExternalSticker:${canExtStickers}`);
        } catch { /* ignore */ }
    }
    console.log('[NITRO] Nitro-feature check complete.');
});

// ═══════════════════════════════════════════════════
// 💬  MESSAGE CREATE — مراقبة الرسائل
// ═══════════════════════════════════════════════════
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;

        // تسجيل الـ DMs
        if (message.channel.type === ChannelType.DM) {
            if (message.attachments.size > 0) {
                const attachment = message.attachments.first();
                await logDMActivity(message.author.id, message.author.username, '', 'IN_MEDIA', { imageUrl: attachment.url });
            } else {
                await logDMActivity(message.author.id, message.author.username, message.content, 'IN_TEXT');
            }
            return;
        }

        if (!message.guild || !message.member) return;

        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {

            // Anti-Spam
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
                    }).catch(() => null);
                    if (sm) setTimeout(() => sm.delete().catch(() => {}), 8000);
                    await sendModDM(message.member.user, '🚫 Anti-Spam', 'You were muted for 10 minutes for spamming.', message.guild.name);
                    sendDetailedLog(message.guild, 'Anti-Spam Triggered', `<@${message.author.id}> timed out 10 minutes for spam.`, '#e67e22');
                    recordSync('ANTI_SPAM', `User <@${message.author.id}> timed out for spam.`);
                    return;
                }
            }

            // Anti-Mass-Mention
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
                    }).catch(() => null);
                    if (mm) setTimeout(() => mm.delete().catch(() => {}), 10000);
                    sendDetailedLog(message.guild, 'Mass Mention Ban', `<@${message.author.id}> banned — ${mentionCount} mentions.`, '#c0392b');
                    recordSync('ANTI_MASS_MENTION', `User <@${message.author.id}> banned for mass mention.`);
                    return;
                }
            }

            // Anti-Caps
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
                        }).catch(() => null);
                        if (cm) setTimeout(() => cm.delete().catch(() => {}), 6000);
                        return;
                    }
                }
            }
        }

        // Anti-Link
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
                        'You sent an unauthorized link or advertisement. This is your first warning.', message.guild.name);
                    const m = await message.channel.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('🚫 Security Violation')
                            .setDescription(`<@${message.author.id}> Sending unauthorized links or advertisements is strictly forbidden.`)
                            .setColor('#e74c3c')
                            .setFooter({ text: 'Next violation will result in a timeout.' })]
                    }).catch(() => null);
                    if (m) setTimeout(() => m.delete().catch(() => {}), 10000);
                    sendDetailedLog(message.guild, 'Automod Warn (Link) ⚠️', `User <@${message.author.id}> received first warning for links.`, '#f1c40f');
                    recordSync('ANTI_LINK_WARN', `User <@${message.author.id}> warned for link.`);
                } else if (warns === 2) {
                    await message.member.timeout(60 * 60 * 1000, 'Sending links/Advertising').catch(() => {});
                    await sendModDM(message.member.user, '🤐 Timeout — 1 Hour',
                        'You have been muted for 1 hour for repeatedly sending unauthorized links.', message.guild.name);
                    await message.channel.send(`🤐 <@${message.author.id}> has been muted for 1 hour for repeated link violations.`).catch(() => {});
                    sendDetailedLog(message.guild, 'Automod Timeout (Link) 🤐', `User <@${message.author.id}> timed out 1 hour for link spam.`, '#e67e22');
                    recordSync('ANTI_LINK_TIMEOUT', `User <@${message.author.id}> timed out for link.`);
                } else {
                    await sendModDM(message.member.user, '🚫 Permanent Ban',
                        'You have been permanently banned for persistent advertising and security breaches.', message.guild.name);
                    await message.member.ban({ reason: 'Persistent Advertising & Security Breach' }).catch(() => {});
                    await message.channel.send(`🚫 <@${message.author.id}> has been permanently banned for extreme advertising.`).catch(() => {});
                    sendDetailedLog(message.guild, 'User Banned (Anti-Link)', `User **${message.author.tag || message.author.username}** banned for bypassing link security.`, '#c0392b');
                    recordSync('ANTI_LINK_BAN', `User <@${message.author.id}> banned for link.`);
                }
                return;
            }
        }

        // Anti-Bad-Word
        if (protectionSettings.get('antiBadWord') && message.member && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const hasBadWord = BAD_WORDS.some(word => message.content.toLowerCase().includes(word));
            if (hasBadWord) {
                await message.delete().catch(() => {});
                let count = (warnStorage.get(message.author.id) || 0) + 1;
                warnStorage.set(message.author.id, count);
                if (count === 1) {
                    await message.member.timeout(5 * 60 * 1000, 'Swearing in server').catch(() => {});
                    await sendModDM(message.member.user, '🤐 Timeout — 5 Minutes',
                        'You have been muted for 5 minutes for using inappropriate language.', message.guild.name);
                    const m = await message.channel.send(`⚠️ <@${message.author.id}>, you have been muted for 5 minutes for inappropriate language.`).catch(() => null);
                    if (m) setTimeout(() => m.delete().catch(() => {}), 10000);
                    sendDetailedLog(message.guild, 'Automod Warn (Bad Word) ⚠️', `User <@${message.author.id}> timed out 5 mins for bad words.`, '#f1c40f');
                    recordSync('ANTI_BADWORD_TIMEOUT', `User <@${message.author.id}> timed out for bad word.`);
                } else {
                    await sendModDM(message.member.user, '🚫 Permanent Ban',
                        'You have been permanently banned for repeated use of inappropriate language.', message.guild.name);
                    await message.member.ban({ reason: 'Repeated severe swearing' }).catch(() => {});
                    await message.channel.send(`🚫 <@${message.author.id}> has been permanently banned for repeated inappropriate language.`).catch(() => {});
                    sendDetailedLog(message.guild, 'Automod Ban (Bad Word) 🚫', `User <@${message.author.id}> permanently banned for bad language.`, '#c0392b');
                    recordSync('ANTI_BADWORD_BAN', `User <@${message.author.id}> banned for bad word.`);
                }
                return;
            }
        }

        // Anti-Token-Grab — كشف محاولات سرقة التوكن
        if (protectionSettings.get('antiTokenGrab') && message.member && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const tokenPatterns = [
                /[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g, // نمط Discord token
                /discord\.gift\/[A-Za-z0-9]+/gi,    // كودات هدايا مشبوهة
                /grabify\.link/gi,                    // روابط Grabify
                /leakinfo\.me/gi,                     // مواقع تسريب
                /iplogger\./gi                         // IP loggers
            ];
            const contentLower = message.content;
            const hasTokenPattern = tokenPatterns.some(p => { p.lastIndex = 0; return p.test(contentLower); });
            if (hasTokenPattern) {
                await message.delete().catch(() => {});
                await message.member.ban({ reason: 'Token grabbing / Suspicious link detected' }).catch(() => {});
                sendDetailedLog(message.guild, '🛡️ Token Grab Attempt Blocked!',
                    `<@${message.author.id}> was banned for sending suspicious content (possible token grabber).\nContent flagged by Anti-Token-Grab v7.5.`, '#c0392b');
                logSecurityEvent('TOKEN_GRAB', `User ${message.author.id} sent suspicious content.`);
                recordSync('TOKEN_GRAB_BAN', `User <@${message.author.id}> banned for token grab attempt.`);
            }
        }

    } catch (e) { console.error('messageCreate error:', e.message); }
});

// ═══════════════════════════════════════════════════
// ⚡  INTERACTION CREATE — معالجة الـ Interactions
// ═══════════════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
    try {

        // ── 🛡️ SECURITY GATE ──────────────────────────────────────────
        if (!interaction.guild) {
            if (interaction.isRepliable()) await interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true }).catch(() => {});
            return;
        }

        const interactingUser = interaction.user;

        if (interaction.isChatInputCommand()) {
            const cmdName = interaction.commandName;

            // تحقق مزدوج من المالك أو الرتبة المسموحة
            if (OWNER_ONLY_COMMANDS.has(cmdName) && !PUBLIC_COMMANDS.includes(cmdName)) {
                if (!isOwner(interactingUser.id)) {
                    logSecurityEvent('UNAUTH_ACCESS', `User ${interactingUser.id} (${interactingUser.username}) tried /${cmdName}`);
                    return await interaction.reply({ content: '❌ هذا الأمر للمالك فقط.', ephemeral: true });
                }
            }

            // Rate limit
            if (!isOwner(interactingUser.id) && checkRateLimit(interactingUser.id, cmdName)) {
                return await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle('⏳ Slow Down!')
                        .setDescription('You\'re sending commands too fast. Please wait a moment.')
                        .setColor('#e74c3c')],
                    ephemeral: true
                });
            }
        }

        if (interactingUser.bot) return;
        // ── END SECURITY GATE ──────────────────────────────────────────

        // ── Context Menu Commands ──────────────────────────────────────
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

        // ── Translate Context Modal Submit ─────────────────────────────
        if (interaction.isModalSubmit() && interaction.customId.startsWith('translate_ctx_')) {
            const msgId  = interaction.customId.replace('translate_ctx_', '');
            const toLang = interaction.fields.getTextInputValue('translate_lang').toLowerCase().trim();
            let originalText = '';
            try {
                const ch  = interaction.channel;
                const msg = ch ? await ch.messages.fetch(msgId).catch(() => null) : null;
                if (msg) originalText = msg.embeds.length > 0 ? (msg.embeds[0].description || msg.embeds[0].title || '') : msg.content;
            } catch { }
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

        // ── Delete DM button ───────────────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('delete_dm_')) {
            const targetId = interaction.customId.replace('delete_dm_', '');
            if (interaction.user.id === targetId) {
                await logDMActivity(interaction.user.id, interaction.user.tag || interaction.user.username,
                    `🗑️ User deleted DM message (ID: ${interaction.message.id})`, 'ALERT');
                await interaction.message.delete().catch(() => {});
                await interaction.reply({ content: '✅ Message deleted.', ephemeral: true }).catch(() => {});
            } else {
                await interaction.reply({ content: '❌ You are not authorised to delete this message.', ephemeral: true });
            }
            return;
        }

        // ── Rank Modal Button ──────────────────────────────────────────
        if (interaction.isButton() && interaction.customId === 'open_rank_modal') {
            const modal = new ModalBuilder().setCustomId('rank_modal').setTitle('Rank Request');
            const userField = new TextInputBuilder().setCustomId('xbox_user').setLabel("Xbox Username")
                .setStyle(TextInputStyle.Short).setPlaceholder("Enter your Xbox username").setRequired(true);
            const rankField = new TextInputBuilder().setCustomId('rank_type').setLabel("Rank you want")
                .setStyle(TextInputStyle.Short).setPlaceholder("Enter the rank name").setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(userField), new ActionRowBuilder().addComponents(rankField));
            return await interaction.showModal(modal);
        }

        // ── Form Buttons ───────────────────────────────────────────────
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

        if (interaction.isButton() && interaction.customId.startsWith('form_start_')) {
            const targetChannelId = interaction.customId.split('_')[2];
            const modal = new ModalBuilder().setCustomId(`submit_modal_${targetChannelId}`).setTitle('Custom Submission Form');
            const nameField    = new TextInputBuilder().setCustomId('user_name').setLabel('Enter your name:')
                .setStyle(TextInputStyle.Short).setPlaceholder('Type here...').setRequired(true);
            const detailsField = new TextInputBuilder().setCustomId('user_details').setLabel('Details / Description:')
                .setStyle(TextInputStyle.Paragraph).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(nameField), new ActionRowBuilder().addComponents(detailsField));
            return await interaction.showModal(modal);
        }

        // ── Clear Buttons ──────────────────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('clear_everyone_')) {
            const parts  = interaction.customId.split('_');
            const amount = parseInt(parts[2]);
            const chId   = parts[3];
            await interaction.update({ content: '🧹 Clearing all messages...', components: [] });
            const targetCh = client.channels.cache.get(chId);
            if (targetCh) await targetCh.bulkDelete(amount, true).catch(() => {});
            await interaction.followUp({ content: `✅ Cleared up to **${amount}** messages from everyone.`, ephemeral: true }).catch(() => {});
            clearSessionStore.delete(interaction.user.id);
            return;
        }

        if (interaction.isUserSelectMenu() && interaction.customId.startsWith('clear_user_select_')) {
            const parts       = interaction.customId.split('_');
            const amount      = parseInt(parts[3]);
            const chId        = parts[4];
            const targetCh    = client.channels.cache.get(chId);
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
            } catch (e) { console.error('clear_user_select error:', e.message); }
            clearSessionStore.delete(interaction.user.id);
            await interaction.followUp({ content: `✅ Deleted **${deleted}** message(s) from the selected user(s).`, ephemeral: true }).catch(() => {});
            return;
        }

        // ── Role Buttons ───────────────────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('role_everyone_')) {
            const parts  = interaction.customId.split('_');
            const act    = parts[2];
            const roleId = parts[3];
            const isGive = act !== 'remove';
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
                return await interaction.reply({ content: '❌ You do not have permission to manage roles.', ephemeral: true });
            await interaction.update({ content: `⏳ ${isGive ? 'Assigning' : 'Removing'} role ${isGive ? 'to' : 'from'} all members...`, components: [] });
            const members = await interaction.guild.members.fetch().catch(() => null);
            if (!members) return;
            let count = 0;
            for (const [, member] of members) {
                if (member.user.bot) continue;
                if (isGive) await member.roles.add(roleId).catch(() => {});
                else        await member.roles.remove(roleId).catch(() => {});
                count++;
                await new Promise(r => setTimeout(r, 300));
            }
            roleSessionStore.delete(interaction.user.id);
            await interaction.followUp({ content: `✅ Role <@&${roleId}> ${isGive ? 'assigned to' : 'removed from'} **${count}** members.`, ephemeral: true }).catch(() => {});
            return;
        }

        if (interaction.isButton() && interaction.customId === 'role_cancel') {
            roleSessionStore.delete(interaction.user.id);
            await interaction.update({ content: '✖️ Action cancelled.', components: [] });
            return;
        }

        if (interaction.isUserSelectMenu() && interaction.customId.startsWith('role_user_select_')) {
            const raw           = interaction.customId.replace('role_user_select_', '');
            const isRemoveAct   = raw.startsWith('remove_');
            const roleId        = isRemoveAct ? raw.replace('remove_', '') : raw.replace('give_', '').replace(/^[^_]+_/, '');
            const isGive        = !isRemoveAct;
            const selectedUsers = interaction.users;
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
                return await interaction.reply({ content: '❌ You do not have permission to manage roles.', ephemeral: true });
            await interaction.update({ content: `⏳ ${isGive ? 'Assigning' : 'Removing'} role ${isGive ? 'to' : 'from'} ${selectedUsers.size} member(s)...`, components: [] });
            let count = 0;
            for (const [, user] of selectedUsers) {
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                if (member) {
                    if (isGive) await member.roles.add(roleId).catch(() => {});
                    else        await member.roles.remove(roleId).catch(() => {});
                    count++;
                }
                if (isGive) await sendModDM(user, `✨ New Role`, `You have been given the <@&${roleId}> role.`, interaction.guild.name);
                else        await sendModDM(user, `🔻 Role Removed`, `The <@&${roleId}> role has been removed from you.`, interaction.guild.name);
            }
            roleSessionStore.delete(interaction.user.id);
            sendDetailedLog(interaction.guild, isGive ? 'Role Batch Assigned 👑' : 'Role Batch Removed 🔻',
                `Role <@&${roleId}> was ${isGive ? 'given to' : 'removed from'} **${count}** member(s) by <@${interaction.user.id}>.`, isGive ? '#2ecc71' : '#e74c3c');
            await interaction.followUp({ content: `✅ Role <@&${roleId}> ${isGive ? 'assigned to' : 'removed from'} **${count}** member(s).`, ephemeral: true }).catch(() => {});
            return;
        }

        // ── Delete Reaction Select ─────────────────────────────────────
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('delete_reaction_')) {
            const parts    = interaction.customId.split('_');
            const chId     = parts[2];
            const msgId    = parts[3];
            const emojiVal = interaction.values[0];
            try {
                const tc  = await client.channels.fetch(chId).catch(() => null);
                if (!tc) return await interaction.update({ content: '❌ Channel not found.', components: [] });
                const tm  = await tc.messages.fetch(msgId).catch(() => null);
                if (!tm) return await interaction.update({ content: '❌ Message not found.', components: [] });
                const reaction = tm.reactions.cache.find(r => (r.emoji.id || r.emoji.name) === emojiVal);
                if (reaction) await reaction.remove().catch(() => {});
                await interaction.update({ content: `✅ Reaction removed successfully.`, components: [] });
            } catch (e) {
                await interaction.update({ content: '❌ Failed to remove reaction.', components: [] }).catch(() => {});
            }
            return;
        }

        // ── DM Target Select ───────────────────────────────────────────
        if (interaction.isUserSelectMenu() && interaction.customId === 'dm_target_select') {
            const settings = dmSettingsStorage.get(interaction.user.id);
            if (!settings) return await interaction.reply({ content: '❌ Session expired. Run the /dm command again.', ephemeral: true });
            await interaction.update({ content: `⏳ Sending DMs to **${interaction.users.size}** user(s)...`, components: [] });
            let sent = 0;
            for (const [, user] of interaction.users) {
                if (user.bot) continue;
                const ok = await executeSmartSend(user, interaction.user, settings);
                if (ok) sent++;
                await new Promise(r => setTimeout(r, settings.delay > 0 ? settings.delay * 60000 : 1200));
            }
            dmSettingsStorage.delete(interaction.user.id);
            await interaction.followUp({ content: `✅ DM sent to **${sent}** user(s).`, ephemeral: true }).catch(() => {});
            return;
        }

        // ── DM Send to All Button ──────────────────────────────────────
        if (interaction.isButton() && interaction.customId === 'dm_send_to_all') {
            const settings = dmSettingsStorage.get(interaction.user.id);
            if (!settings) return await interaction.reply({ content: '❌ Session expired. Run the /dm command again.', ephemeral: true });
            await interaction.update({ content: '⏳ Sending DMs to all members...', components: [] });
            const members = await interaction.guild.members.fetch().catch(() => null);
            if (!members) return;
            let sent = 0;
            for (const [, member] of members) {
                if (member.user.bot) continue;
                const ok = await executeSmartSend(member.user, interaction.user, settings);
                if (ok) sent++;
                await new Promise(r => setTimeout(r, 1200));
            }
            dmSettingsStorage.delete(interaction.user.id);
            await interaction.followUp({ content: `✅ DM sent to **${sent}** members.`, ephemeral: true }).catch(() => {});
            return;
        }

        // ── DM Exclude Select ──────────────────────────────────────────
        if (interaction.isUserSelectMenu() && interaction.customId === 'dm_exclude_select') {
            const settings    = dmSettingsStorage.get(interaction.user.id);
            if (!settings) return await interaction.reply({ content: '❌ Session expired.', ephemeral: true });
            const excludedIds = new Set(interaction.users.map(u => u.id));
            await interaction.update({ content: `⏳ Sending DMs to everyone except **${excludedIds.size}** excluded user(s)...`, components: [] });
            const members = await interaction.guild.members.fetch().catch(() => null);
            if (!members) return;
            let sent = 0;
            for (const [, member] of members) {
                if (member.user.bot || excludedIds.has(member.id)) continue;
                const ok = await executeSmartSend(member.user, interaction.user, settings);
                if (ok) sent++;
                await new Promise(r => setTimeout(r, 1200));
            }
            dmSettingsStorage.delete(interaction.user.id);
            await interaction.followUp({ content: `✅ DM sent to **${sent}** members (${excludedIds.size} excluded).`, ephemeral: true }).catch(() => {});
            return;
        }

        // ── Ad Stop Buttons ────────────────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('stop_ad_')) {
            const name = interaction.customId.replace('stop_ad_', '');
            const ad   = adsStorage.get(name);
            if (ad) {
                if (ad.timer) clearInterval(ad.timer);
                adsStorage.delete(name);
                await interaction.update({ content: `🗑️ Ad **${name}** stopped and removed.`, components: [] });
            } else {
                await interaction.reply({ content: '❌ Ad not found or already stopped.', ephemeral: true });
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

        // ── Vote Button Handler ────────────────────────────────────────
        if (interaction.isButton() && /^vote_\d+_opt\d+$/.test(interaction.customId)) {
            const parts   = interaction.customId.split('_');
            const voteId  = `vote_${parts[1]}`;
            const optKey  = parts[2];
            const data    = voteStore.get(voteId);
            if (!data) return await interaction.reply({ content: '❌ This vote has expired or could not be found.', ephemeral: true });
            const prevOpt = data.votes[interaction.user.id];
            if (prevOpt === optKey) {
                delete data.votes[interaction.user.id];
            } else {
                data.votes[interaction.user.id] = optKey;
            }
            const counts = {};
            for (let i = 1; i <= data.labels.length; i++) counts[`opt${i}`] = 0;
            for (const v of Object.values(data.votes)) counts[v] = (counts[v] || 0) + 1;
            const total   = Object.values(counts).reduce((a, b) => a + b, 0);
            const summary = data.labels.map((lbl, i) => {
                const k   = `opt${i + 1}`;
                const cnt = counts[k] || 0;
                const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
                const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
                return `**${lbl}** — ${cnt} votes (${pct}%)\n\`${bar}\``;
            }).join('\n\n');
            const newEmbed = new EmbedBuilder()
                .setTitle('📊 Vote')
                .setDescription(`**${data.question}**\n\n${summary}`)
                .setColor(validateHexColor(data.embedColor || '#f1c40f'))
                .setFooter({ text: `${total} vote(s) total • Click again to remove your vote` })
                .setTimestamp();
            await interaction.update({ embeds: [newEmbed] }).catch(() => {});
            return;
        }

        // ── Appeal / Report Buttons ────────────────────────────────────
        if (interaction.isButton() && interaction.customId.startsWith('appeal_accept_')) {
            const userId = interaction.customId.replace('appeal_accept_', '');
            const user   = await client.users.fetch(userId).catch(() => null);
            if (user) await sendModDM(user, '✅ Appeal Accepted', 'Your appeal has been reviewed and **accepted**. Welcome back!', interaction.guild?.name || 'Pro Server');
            await interaction.update({ content: `✅ Appeal for <@${userId}> **accepted** by <@${interaction.user.id}>.`, components: [] });
            recordSync('APPEAL_ACCEPTED', `Appeal for <@${userId}> accepted.`);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('appeal_deny_')) {
            const userId = interaction.customId.replace('appeal_deny_', '');
            const user   = await client.users.fetch(userId).catch(() => null);
            if (user) await sendModDM(user, '❌ Appeal Denied', 'Your appeal has been reviewed and **denied**.', interaction.guild?.name || 'Pro Server');
            await interaction.update({ content: `❌ Appeal for <@${userId}> **denied** by <@${interaction.user.id}>.`, components: [] });
            recordSync('APPEAL_DENIED', `Appeal for <@${userId}> denied.`);
            return;
        }

        // ── Modal Submissions ──────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            const cid = interaction.customId;

            // 🎨 COLOR PICKER MODALS — معالجة لوحة الألوان
            // /send color picker
            if (cid === 'color_picker_send') {
                const hexInput = interaction.fields.getTextInputValue('hex_color');
                const color    = validateHexColor(hexInput);
                const stored   = colorPickerStore.get(interaction.user.id + '_send');
                colorPickerStore.delete(interaction.user.id + '_send');
                if (!stored) return await interaction.reply({ content: '❌ Session expired. Run /send again.', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                const { msg, style, delay, delAfter, replyLink, targetChannelId } = stored;
                const sendTo    = targetChannelId ? (interaction.guild.channels.cache.get(targetChannelId) || interaction.channel) : interaction.channel;
                const delayStr  = delay === 0 ? 'now' : `in ${delay} minute(s)`;
                await interaction.editReply({ content: `✅ Message will be sent ${delayStr}. Color: \`${color}\`` });

                setTimeout(async () => {
                    try {
                        let replyMsgObj = null;
                        if (replyLink) {
                            const lp = replyLink.split('/');
                            const rc = await client.channels.fetch(lp[lp.length - 2]).catch(() => null);
                            replyMsgObj = rc ? await rc.messages.fetch(lp[lp.length - 1]).catch(() => null) : null;
                        }
                        const sendOpts = style === 'embed'
                            ? { embeds: [new EmbedBuilder().setDescription(msg).setColor(color)] }
                            : { content: msg };
                        const sent = replyMsgObj
                            ? await replyMsgObj.reply(sendOpts).catch(() => sendTo.send(sendOpts).catch(() => {}))
                            : await sendTo.send(sendOpts).catch(() => {});
                        if (sent && delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
                    } catch (e) { console.error('color_picker_send execute error:', e.message); }
                }, delay * 60000);
                return;
            }

            // /dm color picker
            if (cid === 'color_picker_dm') {
                const hexInput = interaction.fields.getTextInputValue('hex_color');
                const color    = validateHexColor(hexInput);
                const stored   = colorPickerStore.get(interaction.user.id + '_dm');
                colorPickerStore.delete(interaction.user.id + '_dm');
                if (!stored) return await interaction.reply({ content: '❌ Session expired. Run /dm again.', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                const settings = { ...stored.settings, color };
                dmSettingsStorage.set(interaction.user.id, settings);

                if (stored.target === 'select') {
                    const userSelector = new UserSelectMenuBuilder()
                        .setCustomId('dm_target_select').setPlaceholder('☑️ Select the users to send the DM to')
                        .setMinValues(1).setMaxValues(25);
                    return await interaction.editReply({
                        content: `☑️ **Select Users:** Pick the members you want to message:\n🎨 Color: \`${color}\``,
                        components: [new ActionRowBuilder().addComponents(userSelector)]
                    });
                }
                if (stored.target === 'everyone') {
                    const sendAllBtn = new ButtonBuilder().setCustomId('dm_send_to_all').setLabel('✅ Send to All Members').setStyle(ButtonStyle.Success);
                    return await interaction.editReply({
                        content: `🌐 **Everyone Mode:** Press to send to all members.\n🎨 Color: \`${color}\``,
                        components: [new ActionRowBuilder().addComponents(sendAllBtn)]
                    });
                }
                if (stored.target === 'everyone_exc') {
                    const exceptionSelector = new UserSelectMenuBuilder()
                        .setCustomId('dm_exclude_select').setPlaceholder('🚫 Select users to EXCLUDE')
                        .setMinValues(1).setMaxValues(25);
                    const sendAllBtn = new ButtonBuilder().setCustomId('dm_send_to_all').setLabel('Skip Exclusions — Send to All ✅').setStyle(ButtonStyle.Success);
                    return await interaction.editReply({
                        content: `🚫 **Everyone Except:** Select users to skip.\n🎨 Color: \`${color}\``,
                        components: [new ActionRowBuilder().addComponents(exceptionSelector), new ActionRowBuilder().addComponents(sendAllBtn)]
                    });
                }
                return;
            }

            // /vote color picker
            if (cid === 'color_picker_vote') {
                const hexInput = interaction.fields.getTextInputValue('hex_color');
                const color    = validateHexColor(hexInput);
                const stored   = colorPickerStore.get(interaction.user.id + '_vote');
                colorPickerStore.delete(interaction.user.id + '_vote');
                if (!stored) return await interaction.reply({ content: '❌ Session expired. Run /vote again.', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                const { question, btns, labels } = stored;
                const voteId = `vote_${Date.now()}`;
                const finalBtns = btns.map((b, i) => new ButtonBuilder()
                    .setCustomId(`${voteId}_opt${i + 1}`)
                    .setLabel(b.label)
                    .setStyle(b.style));
                if (finalBtns.length === 0) {
                    finalBtns.push(
                        new ButtonBuilder().setCustomId(`${voteId}_opt1`).setLabel('Yes ✅').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`${voteId}_opt2`).setLabel('No ❌').setStyle(ButtonStyle.Danger)
                    );
                }
                voteStore.set(voteId, { question, votes: {}, labels: finalBtns.map(b => b.data.label), embedColor: color });
                return await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle('📊 New Vote')
                        .setDescription(`**${question}**\n\n${finalBtns.map(b => `${b.data.label}: **0**`).join('  •  ')}`)
                        .setColor(color)
                        .setFooter({ text: 'Click a button to cast your vote!' })],
                    components: [new ActionRowBuilder().addComponents(finalBtns)]
                });
            }

            // /setup-form color picker
            if (cid === 'color_picker_setupform') {
                const hexInput = interaction.fields.getTextInputValue('hex_color');
                const color    = validateHexColor(hexInput);
                const stored   = colorPickerStore.get(interaction.user.id + '_setupform');
                colorPickerStore.delete(interaction.user.id + '_setupform');
                if (!stored) return await interaction.reply({ content: '❌ Session expired. Run /setup-form again.', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                const { messageText, fields, btns, targetChannelId, resultIsBox, sendToDM, dmUserId } = stored;
                const formTimestamp = Date.now();
                btns.forEach((btn, i) => formSettingsDB.set(btn.customId, { fields, resultIsBox, targetChannel: targetChannelId }));
                const row = new ActionRowBuilder().addComponents(
                    btns.map(b => new ButtonBuilder().setCustomId(b.customId).setLabel(b.label).setStyle(b.btnStyle))
                );
                if (sendToDM && dmUserId) {
                    const dmUser = await client.users.fetch(dmUserId).catch(() => null);
                    if (dmUser) {
                        try {
                            const dmCh = await dmUser.createDM();
                            await dmCh.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(messageText)], components: [row] });
                            return await interaction.editReply({ content: `✅ Form sent to **${dmUser.username}**'s DM! Color: \`${color}\`` });
                        } catch { return await interaction.editReply({ content: `❌ Could not DM the user. DMs may be disabled.` }); }
                    }
                }
                await interaction.editReply({ content: `✅ Done! Form sent with **${btns.length}** button(s). Color: \`${color}\`` });
                const targetCh = interaction.guild.channels.cache.get(targetChannelId) || interaction.channel;
                await targetCh.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(messageText)], components: [row] }).catch(() => {});
                return;
            }

            // Reaction Context Modal
            if (cid.startsWith('reaction_ctx_')) {
                const parts = cid.split('_');
                const chId  = parts[2];
                const msgId = parts[3];
                const emoji = interaction.fields.getTextInputValue('reaction_emoji');
                try {
                    const tc = await client.channels.fetch(chId).catch(() => null);
                    if (!tc) return await interaction.reply({ content: '❌ Channel not found.', ephemeral: true });
                    const tm = await tc.messages.fetch(msgId).catch(() => null);
                    if (!tm) return await interaction.reply({ content: '❌ Message not found.', ephemeral: true });
                    await tm.react(emoji);
                    await interaction.reply({ content: `✅ Reacted with ${emoji}!`, ephemeral: true });
                } catch {
                    await interaction.reply({ content: '❌ Failed to add reaction. Make sure the emoji is valid.', ephemeral: true });
                }
                return;
            }

            // Rank Modal
            if (cid === 'rank_modal') {
                const xbox  = interaction.fields.getTextInputValue('xbox_user');
                const rank  = interaction.fields.getTextInputValue('rank_type');
                const logCh = client.channels.cache.get(CONFIG.SUBMIT_LOG);
                if (logCh) await logCh.send(`🔔 New Rank Request from <@${interaction.user.id}>:\n**Username:** ${xbox}\n**Rank:** ${rank}`).catch(() => {});
                await logDMActivity(interaction.user.id, interaction.user.tag || interaction.user.username, `[RANK MODAL] Xbox: ${xbox} | Rank: ${rank}`, 'IN_TEXT');
                return await interaction.reply({ content: '✅ Your request has been submitted to the owner!', ephemeral: true });
            }

            // Smart Edit Modal
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
                        const original = tm.embeds[0];
                        const updated  = new EmbedBuilder().setColor(original.color || '#3498db').setDescription(newText).setTimestamp();
                        if (original.title)        updated.setTitle(original.title);
                        if (original.image?.url)   updated.setImage(original.image.url);
                        if (original.footer?.text) updated.setFooter({ text: original.footer.text });
                        await tm.edit({ embeds: [updated] });
                    } else {
                        await tm.edit({ content: newText });
                    }
                    return await interaction.reply({ content: '✅ Message updated successfully!', ephemeral: true });
                } catch {
                    return await interaction.reply({ content: '❌ Failed to edit the message.', ephemeral: true });
                }
            }

            // Form Submit
            if (cid.startsWith('submit_form_')) {
                const originalFormId = cid.replace('submit_form_', '');
                const formSettings   = formSettingsDB.get(originalFormId);
                if (!formSettings) return await interaction.reply({ content: '❌ Form session expired.', ephemeral: true });
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
                            .setAuthor({ name: interaction.user.tag || interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                            .addFields(embedFields).setTimestamp();
                        await targetChannel.send({ embeds: [resultEmbed] });
                    } else {
                        await targetChannel.send(plainTextResult);
                    }
                } catch (error) { console.error('Form submit error:', error.message); }
                return;
            }

            if (cid.startsWith('submit_modal_')) {
                const targetChannelId = cid.split('_')[2];
                const userName        = interaction.fields.getTextInputValue('user_name');
                const userDetails     = interaction.fields.getTextInputValue('user_details');
                const resultEmbed     = new EmbedBuilder().setColor('#5865F2').setTitle('📥 New Submission Received')
                    .addFields(
                        { name: 'From User', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Name',      value: userName },
                        { name: 'Details',   value: userDetails || 'No details' }
                    ).setTimestamp();
                try {
                    const targetChannel = await client.channels.fetch(targetChannelId);
                    await targetChannel.send({ embeds: [resultEmbed] });
                    return await interaction.reply({ content: '✅ Your information has been sent successfully!', ephemeral: true });
                } catch {
                    return await interaction.reply({ content: '❌ Failed to send your submission. Please try again.', ephemeral: true });
                }
            }

            // Appeal Modal
            if (cid === 'appeal_modal') {
                const appealReason = interaction.fields.getTextInputValue('appeal_reason');
                const appealAction = interaction.fields.getTextInputValue('appeal_action');
                const appealExtra  = interaction.fields.getTextInputValue('appeal_extra');
                const logCh        = client.channels.cache.get(CONFIG.SUBMIT_LOG);
                if (logCh) {
                    const appealEmbed = new EmbedBuilder().setTitle('📩 New Appeal Received').setColor('#f1c40f')
                        .setAuthor({ name: interaction.user.tag || interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                        .addFields(
                            { name: '👤 User',                   value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: false },
                            { name: '🔨 Action Being Appealed',  value: appealAction || 'Not specified',   inline: false },
                            { name: '📝 Reason / Explanation',   value: appealReason || 'No reason given', inline: false },
                            { name: '📎 Additional Information', value: appealExtra  || 'None',            inline: false }
                        )
                        .setFooter({ text: 'Pro Robot Appeal System' }).setTimestamp();
                    const acceptBtn = new ButtonBuilder().setCustomId(`appeal_accept_${interaction.user.id}`).setLabel('✅ Accept Appeal').setStyle(ButtonStyle.Success);
                    const denyBtn   = new ButtonBuilder().setCustomId(`appeal_deny_${interaction.user.id}`).setLabel('❌ Deny Appeal').setStyle(ButtonStyle.Danger);
                    await logCh.send({ embeds: [appealEmbed], components: [new ActionRowBuilder().addComponents(acceptBtn, denyBtn)] }).catch(() => {});
                }
                recordSync('APPEAL_SUBMITTED', `User <@${interaction.user.id}> submitted an appeal.`);
                return await interaction.reply({
                    embeds: [new EmbedBuilder().setTitle('✅ Appeal Submitted')
                        .setDescription('Your appeal has been sent to the server administration.\nWe will review it and contact you as soon as possible.\n\nThank you for your patience.')
                        .setColor('#2ecc71').setFooter({ text: 'Pro Robot Appeal System' }).setTimestamp()],
                    ephemeral: true
                });
            }

            // Report Modal
            if (cid === 'report_modal') {
                const reportTitle   = interaction.fields.getTextInputValue('report_title');
                const reportDetails = interaction.fields.getTextInputValue('report_details');
                const reportedUser  = interaction.fields.getTextInputValue('reported_user');
                const imageUrl      = reportImageStore.get(interaction.user.id) || null;
                reportImageStore.delete(interaction.user.id);
                const logCh = client.channels.cache.get(CONFIG.SUBMIT_LOG);
                if (logCh) {
                    const reportEmbed = new EmbedBuilder()
                        .setTitle('🚨 New Report Received').setColor('#e67e22')
                        .setAuthor({ name: interaction.user.tag || interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                        .addFields(
                            { name: '👤 Reported By',    value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: false },
                            { name: '🎯 Subject/Person', value: reportedUser  || 'Not specified', inline: false },
                            { name: '📋 Report Topic',   value: reportTitle   || 'No title',      inline: false },
                            { name: '📝 Details',        value: reportDetails || 'No details',    inline: false },
                            { name: '🖼️ Image Attached', value: imageUrl ? '✅ Yes (see below)' : '❌ No', inline: false }
                        )
                        .setFooter({ text: 'Pro Robot Report System' }).setTimestamp();
                    if (imageUrl) reportEmbed.setImage(imageUrl);
                    await logCh.send({ embeds: [reportEmbed] }).catch(() => {});
                }
                recordSync('REPORT_SUBMITTED', `User <@${interaction.user.id}> submitted a report: ${reportTitle}`);
                return await interaction.reply({
                    embeds: [new EmbedBuilder().setTitle('✅ Report Submitted')
                        .setDescription('Your report has been sent to the administration.\nWe will review it as soon as possible.\n\nThank you for helping keep the server safe.')
                        .setColor('#2ecc71').setFooter({ text: 'Pro Robot Report System' }).setTimestamp()],
                    ephemeral: true
                });
            }
        }

        // ── Autocomplete ───────────────────────────────────────────────
        if (interaction.isAutocomplete()) {
            const focusedOption = interaction.options.getFocused(true);
            const focusedValue  = focusedOption.value.toLowerCase();
            if (focusedOption.name === 'command_name') {
                const allCommandNames = [
                    'ads-edit','ads-set','clear','delete','dm','edit','picture','ping',
                    'pro-robot','reaction','report','role','security-status','send',
                    'server-info','server-status','setup-form','slash-control','sync',
                    'translate','vote','vpn'
                ];
                const filtered = allCommandNames.filter(c => c.includes(focusedValue)).slice(0, 25);
                await interaction.respond(filtered.map(c => ({ name: `/${c}`, value: c }))).catch(() => {});
            } else {
                const choices  = Array.from(adsStorage.keys());
                const filtered = choices.filter(c => c.startsWith(focusedValue));
                await interaction.respond(filtered.map(c => ({ name: c, value: c }))).catch(() => {});
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const { commandName, options, guild, channel } = interaction;

        // ── Owner-only check — مع دعم الـ /slash-control ──────────────
        // إذا مش المالك → فحص هل في رتبة مسموحة للأمر ده
        if (!PUBLIC_COMMANDS.includes(commandName) && !isOwner(interaction.user.id)) {
            const allowedRoleId = cmdPermissions.get(commandName);
            if (allowedRoleId) {
                if (!interaction.member?.roles.cache.has(allowedRoleId)) {
                    return await interaction.reply({
                        content: `❌ Access Denied! This command requires the <@&${allowedRoleId}> role.`,
                        ephemeral: true
                    });
                }
                // المستخدم عنده الرتبة — مسموح له
            } else {
                return await interaction.reply({
                    content: '❌ This command is only available to the server owner.',
                    ephemeral: true
                });
            }
        }

        // ── 🎨 COLOR PICKER — early exit before deferReply ────────────
        // /send with custom color
        if (commandName === 'send') {
            const color = options.getString('color');
            if (color === 'custom') {
                const msg           = options.getString('message');
                const style         = options.getString('style');
                const delay         = options.getInteger('delay_send');
                const delAfter      = options.getInteger('delete_after');
                const replyLink     = options.getString('reply_to') || null;
                const targetChannel = options.getChannel('target_channel');
                colorPickerStore.set(interaction.user.id + '_send', {
                    msg, style, delay, delAfter, replyLink,
                    targetChannelId: targetChannel?.id || null
                });
                const modal = new ModalBuilder()
                    .setCustomId('color_picker_send')
                    .setTitle('🎨 Pick a Colour');
                const colorInput = new TextInputBuilder()
                    .setCustomId('hex_color')
                    .setLabel('Enter Hex Color Code (e.g: #55ff55)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('#3498db')
                    .setMinLength(4).setMaxLength(7)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
                return await interaction.showModal(modal);
            }
        }

        // /dm with custom color
        if (commandName === 'dm') {
            const color = options.getString('color');
            if (color === 'custom') {
                const style            = options.getString('style');
                const delay            = options.getInteger('delay_send');
                const delAfter         = options.getInteger('delete_after');
                const target           = options.getString('target');
                const msgContent       = options.getString('message') || '';
                const caption          = options.getString('caption') || '';
                const image            = options.getAttachment('image');
                const reactionEmoji    = options.getString('reaction') || null;
                const repeatInterval   = options.getInteger('repeat_interval') || 0;
                const showDeleteButton = options.getBoolean('delete_button') || false;
                const replyLink        = options.getString('reply_to') || null;
                colorPickerStore.set(interaction.user.id + '_dm', {
                    target,
                    settings: { style, delay, delAfter, msgContent, caption, imageUrl: image?.url || null, reactionEmoji, repeatInterval, showDeleteButton, replyLink }
                });
                const modal = new ModalBuilder()
                    .setCustomId('color_picker_dm')
                    .setTitle('🎨 Pick a Colour');
                const colorInput = new TextInputBuilder()
                    .setCustomId('hex_color')
                    .setLabel('Enter Hex Color Code (e.g: #55ff55)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('#3498db')
                    .setMinLength(4).setMaxLength(7)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
                return await interaction.showModal(modal);
            }
        }

        // /vote with custom embed color
        if (commandName === 'vote') {
            const embedColor = options.getString('embed_color');
            if (embedColor === 'custom') {
                const question  = options.getString('question');
                const colorMap  = { 'Primary': ButtonStyle.Primary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger, 'Secondary': ButtonStyle.Secondary };
                const btns = [];
                for (let i = 1; i <= 5; i++) {
                    const lbl = options.getString(`btn${i}_label`);
                    if (!lbl) break;
                    const clr = options.getString(`btn${i}_color`) || 'Primary';
                    btns.push({ label: lbl, style: colorMap[clr] || ButtonStyle.Primary });
                }
                colorPickerStore.set(interaction.user.id + '_vote', { question, btns, labels: btns.map(b => b.label) });
                const modal = new ModalBuilder()
                    .setCustomId('color_picker_vote')
                    .setTitle('🎨 Pick a Colour');
                const colorInput = new TextInputBuilder()
                    .setCustomId('hex_color')
                    .setLabel('Enter Hex Color Code (e.g: #55ff55)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('#f1c40f')
                    .setMinLength(4).setMaxLength(7)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
                return await interaction.showModal(modal);
            }
        }

        // /setup-form with custom embed color
        if (commandName === 'setup-form') {
            const embedColor = options.getString('embed_color');
            if (embedColor === 'custom') {
                const messageText   = options.getString('message_text');
                const isBox         = options.getBoolean('is_box');
                const btn1Name      = options.getString('btn1_name');
                const btn1Color     = options.getString('btn1_color');
                const btn2Name      = options.getString('btn2_name') || null;
                const btn2Color     = options.getString('btn2_color') || 'Primary';
                const btn3Name      = options.getString('btn3_name') || null;
                const btn3Color     = options.getString('btn3_color') || 'Secondary';
                const targetChannel = options.getChannel('target_channel');
                const resultIsBox   = options.getBoolean('result_is_box');
                const sendToDM      = options.getBoolean('send_to_dm') || false;
                const dmUserObj     = options.getUser('dm_user');
                const fields        = [];
                for (let i = 1; i <= 5; i++) { const fn = options.getString(`field_${i}_name`); if (fn) fields.push(fn); }
                const btnColorMap = { 'Primary': ButtonStyle.Primary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger, 'Secondary': ButtonStyle.Secondary };
                const ts     = Date.now();
                const btns   = [{ customId: `form_${ts}_1`, label: btn1Name, btnStyle: btnColorMap[btn1Color] || ButtonStyle.Primary }];
                if (btn2Name) btns.push({ customId: `form_${ts}_2`, label: btn2Name, btnStyle: btnColorMap[btn2Color] || ButtonStyle.Primary });
                if (btn3Name) btns.push({ customId: `form_${ts}_3`, label: btn3Name, btnStyle: btnColorMap[btn3Color] || ButtonStyle.Secondary });
                colorPickerStore.set(interaction.user.id + '_setupform', {
                    messageText, fields, btns, targetChannelId: targetChannel?.id, resultIsBox, sendToDM, dmUserId: dmUserObj?.id || null
                });
                const modal = new ModalBuilder()
                    .setCustomId('color_picker_setupform')
                    .setTitle('🎨 Pick a Colour');
                const colorInput = new TextInputBuilder()
                    .setCustomId('hex_color')
                    .setLabel('Enter Hex Color Code (e.g: #55ff55)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('#3498db')
                    .setMinLength(4).setMaxLength(7)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
                return await interaction.showModal(modal);
            }
        }

        // ── /edit and /report — modals before deferReply ──────────────
        if (commandName === 'edit') {
            const link      = options.getString('message_link');
            const linkParts = link.split('/');
            const chId      = linkParts[linkParts.length - 2];
            const msgId     = linkParts[linkParts.length - 1];
            try {
                const tc = await client.channels.fetch(chId).catch(() => null);
                if (!tc) return await interaction.reply({ content: '❌ Channel not found.', ephemeral: true });
                const tm = await tc.messages.fetch(msgId).catch(() => null);
                if (!tm) return await interaction.reply({ content: '❌ Message not found.', ephemeral: true });
                const oldText = tm.embeds.length > 0 ? (tm.embeds[0].description || '') : (tm.content || '');
                const modal   = new ModalBuilder().setCustomId(`smart_edit_${chId}_${msgId}`).setTitle('Edit Message');
                const input   = new TextInputBuilder().setCustomId('updated_text').setLabel('New content:')
                    .setStyle(TextInputStyle.Paragraph).setValue(oldText).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return await interaction.showModal(modal);
            } catch {
                return await interaction.reply({ content: '❌ Message not found. Check the link.', ephemeral: true });
            }
        }

        if (commandName === 'report') {
            const imageAttachment = options.getAttachment('image');
            if (imageAttachment) reportImageStore.set(interaction.user.id, imageAttachment.url);
            else reportImageStore.delete(interaction.user.id);
            const modal = new ModalBuilder().setCustomId('report_modal').setTitle('Submit a Report');
            const titleField    = new TextInputBuilder().setCustomId('report_title').setLabel('Report Topic / Title')
                .setStyle(TextInputStyle.Short).setPlaceholder('e.g: Spam, Harassment...').setMaxLength(100).setRequired(true);
            const reportedField = new TextInputBuilder().setCustomId('reported_user').setLabel('Who are you reporting?')
                .setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false);
            const detailsField  = new TextInputBuilder().setCustomId('report_details').setLabel('Report Details')
                .setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true);
            modal.addComponents(
                new ActionRowBuilder().addComponents(titleField),
                new ActionRowBuilder().addComponents(reportedField),
                new ActionRowBuilder().addComponents(detailsField)
            );
            return await interaction.showModal(modal);
        }

        // ── Defer Reply ────────────────────────────────────────────────
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        try {
            // Double-check role restriction after defer
            const allowedRoleId = cmdPermissions.get(commandName);
            if (allowedRoleId && !isOwner(interaction.user.id) && !interaction.member?.roles.cache.has(allowedRoleId) && !interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator))
                return await interaction.editReply({ content: `❌ Access Denied! This command requires the <@&${allowedRoleId}> role.` });

            // ─ [COMMAND: ads-edit] ──────────────────────────────────────
            if (commandName === 'ads-edit') {
                const name = options.getString('name');
                const ad   = adsStorage.get(name);
                if (!ad) return await interaction.editReply({ content: '❌ Ad not found.' });
                if (options.getString('text'))    ad.text      = options.getString('text');
                if (options.getChannel('channel')) ad.channelId = options.getChannel('channel').id;
                if (options.getInteger('interval')) ad.interval = options.getInteger('interval');
                if (options.getInteger('delete') !== null) ad.deleteAfter = options.getInteger('delete');
                if (options.getString('style'))   ad.style     = options.getString('style');
                startAdLoop(name, guild.id);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stop_ad_${name}`).setLabel('Delete Ad 🗑️').setStyle(ButtonStyle.Danger));
                return await interaction.editReply({ content: `⚙️ Ad **${name}** updated.`, components: [row] });
            }

            // ─ [COMMAND: ads-set] ───────────────────────────────────────
            if (commandName === 'ads-set') {
                const name = options.getString('name');
                const data = {
                    name, text: options.getString('text'), channelId: options.getChannel('channel').id,
                    interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'),
                    style: options.getString('style'), timer: null, lastMsgId: null
                };
                adsStorage.set(name, data);
                startAdLoop(name, guild.id);
                return await interaction.editReply({ content: `✅ Ad activated: **${name}**` });
            }

            // ─ [COMMAND: clear] ─────────────────────────────────────────
            if (commandName === 'clear') {
                const amount = options.getInteger('amount');
                const target = options.getString('target');
                if (target === 'everyone') {
                    const everyoneBtn = new ButtonBuilder()
                        .setCustomId(`clear_everyone_${amount}_${channel.id}`)
                        .setLabel(`🌐 Delete ${amount} messages from everyone`)
                        .setStyle(ButtonStyle.Danger);
                    return await interaction.editReply({
                        content: `⚠️ This will delete up to **${amount}** messages from **everyone**. Confirm?`,
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
                        content: `☑️ Select the users whose messages to delete (scanning last **${amount}** messages):`,
                        components: [new ActionRowBuilder().addComponents(userSelector)]
                    });
                }
            }

            // ─ [COMMAND: delete] ────────────────────────────────────────
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
                    await interaction.editReply({ content: errorMessage });
                }
            }

            // ─ [COMMAND: dm] ────────────────────────────────────────────
            if (commandName === 'dm') {
                const target           = options.getString('target');
                const style            = options.getString('style');
                const delay            = options.getInteger('delay_send');
                const delAfter         = options.getInteger('delete_after');
                const msgContent       = options.getString('message') || '';
                const caption          = options.getString('caption') || '';
                const image            = options.getAttachment('image');
                const color            = options.getString('color') || '#3498db'; // 'custom' handled above
                const reactionEmoji    = options.getString('reaction') || null;
                const repeatInterval   = options.getInteger('repeat_interval') || 0;
                const showDeleteButton = options.getBoolean('delete_button') || false;
                const replyLink        = options.getString('reply_to') || null;

                if (!msgContent && !image)
                    return await interaction.editReply({ content: '❌ You must provide a **message** or an **image**.' });

                if (repeatInterval > 0) {
                    const adKey = `dmad_${Date.now()}`;
                    dmAdsStorage.set(adKey, {
                        name: adKey, targetUserId: target === 'everyone' || target === 'everyone_exc' ? 'everyone' : 'select',
                        msgContent, caption, imageUrl: image?.url || null, style, color,
                        deleteAfter: delAfter, interval: repeatInterval, guildId: guild?.id,
                        reactionEmoji: reactionEmoji || null, replyLink: replyLink || null, timer: null
                    });
                    if (guild) startDMAdsLoop(adKey, guild.id);
                    const stopRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`stop_dmad_${adKey}`).setLabel('Stop DM Ad 🗑️').setStyle(ButtonStyle.Danger)
                    );
                    return await interaction.editReply({
                        content: `✅ **DM Ad Activated!**\n⏱️ Repeating every **${repeatInterval}** min\n🗑️ Auto-delete after **${delAfter}** min${replyLink ? '\n💬 Reply button included' : ''}`,
                        components: [stopRow]
                    });
                }

                const settings = { style, delay, delAfter, msgContent, caption, imageUrl: image?.url || null, color, reactionEmoji, showDeleteButton, replyLink };
                dmSettingsStorage.set(interaction.user.id, settings);

                if (target === 'select') {
                    const userSelector = new UserSelectMenuBuilder()
                        .setCustomId('dm_target_select').setPlaceholder('☑️ Select the users to send the DM to')
                        .setMinValues(1).setMaxValues(25);
                    return await interaction.editReply({
                        content: `☑️ **Select Users:** Pick the members you want to message:${replyLink ? '\n💬 Reply button will be included.' : ''}`,
                        components: [new ActionRowBuilder().addComponents(userSelector)]
                    });
                }
                if (target === 'everyone') {
                    const sendAllBtn = new ButtonBuilder().setCustomId('dm_send_to_all').setLabel('✅ Send to All Members').setStyle(ButtonStyle.Success);
                    return await interaction.editReply({
                        content: `🌐 **Everyone Mode:** Press the button to send to all members.${replyLink ? '\n💬 Reply button will be included.' : ''}`,
                        components: [new ActionRowBuilder().addComponents(sendAllBtn)]
                    });
                }
                if (target === 'everyone_exc') {
                    const exceptionSelector = new UserSelectMenuBuilder()
                        .setCustomId('dm_exclude_select').setPlaceholder('🚫 Select users to EXCLUDE')
                        .setMinValues(1).setMaxValues(25);
                    const sendAllBtn = new ButtonBuilder().setCustomId('dm_send_to_all').setLabel('Skip Exclusions — Send to All ✅').setStyle(ButtonStyle.Success);
                    return await interaction.editReply({
                        content: `🚫 **Everyone Except:** Select the users you want to skip:${replyLink ? '\n💬 Reply button will be included.' : ''}`,
                        components: [new ActionRowBuilder().addComponents(exceptionSelector), new ActionRowBuilder().addComponents(sendAllBtn)]
                    });
                }
            }

            // ─ [COMMAND: picture] ───────────────────────────────────────
            if (commandName === 'picture') {
                const image    = options.getAttachment('image');
                const style    = options.getString('style');
                const delay    = options.getInteger('delay_send');
                const delAfter = options.getInteger('delete_after');
                const caption  = options.getString('caption') || '';
                await interaction.editReply({ content: `✅ Picture scheduled — sending in ${delay} min, deleting after ${delAfter} min.` });
                setTimeout(async () => {
                    try {
                        let sent;
                        if (style === 'embed') {
                            sent = await channel.send({ embeds: [new EmbedBuilder().setDescription(caption).setImage(image.url).setColor('#3498db').setTimestamp()] }).catch(() => {});
                        } else {
                            sent = await channel.send({ content: caption, files: [image.url] }).catch(() => {});
                        }
                        if (sent && delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
                    } catch (e) { console.error('picture send error:', e.message); }
                }, delay * 60000);
            }

            // ─ [COMMAND: ping] ──────────────────────────────────────────
            if (commandName === 'ping') {
                const sent = await interaction.editReply('🏓 Measuring...');
                const apiPing   = sent.createdTimestamp - interaction.createdTimestamp;
                const wsPing    = client.ws.ping;
                const uptimeSec = Math.floor(process.uptime());
                const uptimeStr = `${Math.floor(uptimeSec/3600)}h ${Math.floor((uptimeSec%3600)/60)}m ${uptimeSec%60}s`;
                const pingColor = wsPing < 100 ? '#2ecc71' : wsPing < 250 ? '#f1c40f' : '#e74c3c';
                const pingEmoji = wsPing < 100 ? '🟢' : wsPing < 250 ? '🟡' : '🔴';
                return await interaction.editReply({
                    content: '',
                    embeds: [new EmbedBuilder()
                        .setTitle('🏓 Pong! — Latency Report')
                        .setColor(pingColor)
                        .addFields(
                            { name: `${pingEmoji} WebSocket Ping`, value: `\`${wsPing}ms\``,  inline: true },
                            { name: '📡 API Roundtrip',            value: `\`${apiPing}ms\``, inline: true },
                            { name: '⏱️ Bot Uptime',               value: `\`${uptimeStr}\``, inline: true }
                        )
                        .setFooter({ text: 'Pro Robot v7.5' })
                        .setTimestamp()]
                });
            }

            // ─ [COMMAND: pro-robot] ─────────────────────────────────────
            if (commandName === 'pro-robot') {
                const sub = options.getSubcommand();

                // 🔒 Admin-only subcommands — channel-info & member-info are public
                const ADMIN_ONLY_SUBS = ['status', 'security', 'presence', 'lockdown', 'monitor-clear', 'warns'];
                if (ADMIN_ONLY_SUBS.includes(sub)) {
                    const hasAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
                    const hasCmdRole = cmdPermissions.has('pro-robot')
                        ? interaction.member?.roles?.cache?.has(cmdPermissions.get('pro-robot'))
                        : false;
                    if (!hasAdmin && !isOwner(interaction.user.id) && !hasCmdRole) {
                        return await interaction.reply({
                            content: '❌ You need **Administrator** permission to use this subcommand.',
                            ephemeral: true
                        });
                    }
                }

                const pNames = {
                    antiSpam:'🛡️ Anti-Spam', antiRaid:'🚨 Anti-Raid', antiLink:'🔗 Anti-Link',
                    antiCaps:'🔤 Anti-Caps', antiMassMention:'📢 Anti-Mass-Mention', antiBadWord:'🤬 Anti-Bad-Word',
                    newAccountProtection:'👶 New Account Protection', vpnProtection:'🌐 VPN Protection',
                    antiWebhook:'🔗 Anti-Webhook', antiBot:'🤖 Anti-Suspicious-Bot', antiTokenGrab:'🛡️ Anti-Token-Grab',
                    sync:'🔄 Sync System'
                };

                if (sub === 'status') {
                    const g = interaction.guild;
                    const pLines = Array.from(protectionSettings.entries()).map(([k, v]) => `${pNames[k] || k} — ${v ? '✅ ON' : '❌ OFF'}`);
                    const uptimeSec   = Math.floor(process.uptime());
                    const uptimeStr   = `${Math.floor(uptimeSec/3600)}h ${Math.floor((uptimeSec%3600)/60)}m ${uptimeSec%60}s`;
                    const wsPing      = client.ws.ping;
                    const presenceMode = client.user?.presence?.status || 'online';
                    const activeServerAds = Array.from(adsStorage.values()).filter(a => a.timer).length;
                    const activeDmAds     = Array.from(dmAdsStorage.values()).filter(a => a.timer).length;
                    const activeVotes     = voteStore.size;
                    const members      = await g.members.fetch().catch(() => null);
                    const totalMembers = g.memberCount;
                    const botCount     = members ? members.filter(m => m.user.bot).size : '?';
                    const humanCount   = members ? totalMembers - botCount : '?';
                    const onlineCount  = members ? members.filter(m => m.presence?.status === 'online').size : '?';
                    const textChs      = g.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
                    const voiceChs     = g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
                    const catChs       = g.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
                    const roleCount    = g.roles.cache.size;
                    const boostCount   = g.premiumSubscriptionCount || 0;
                    const boostTier    = g.premiumTier || 0;
                    const dmLines = dmCommandSettings.size > 0
                        ? Array.from(dmCommandSettings.entries()).map(([cmd, val]) => `\`/${cmd}\` — ${val ? '💬 DM ON' : '🚫 DM OFF'}`).join('\n')
                        : '*No DM overrides*';
                    const restrictLines = cmdPermissions.size > 0
                        ? Array.from(cmdPermissions.entries()).map(([cmd, roleId]) => `\`/${cmd}\` → <@&${roleId}>`).join('\n')
                        : '*No restrictions*';
                    const totalWarns = Array.from(warnStorage.values()).reduce((sum, w) => sum + (Array.isArray(w) ? w.length : 0), 0);
                    const warnedUsers = warnStorage.size;

                    const embed1 = new EmbedBuilder()
                        .setTitle('🤖 Pro Robot — Full Dashboard v7.5')
                        .setColor('#2b2d31')
                        .setThumbnail(client.user.displayAvatarURL())
                        .addFields(
                            { name: '🤖 Bot Info',         value: `Uptime: **${uptimeStr}**\nPing: **${wsPing}ms**\nPresence: **${presenceMode}**\nVersion: **7.5**`, inline: true },
                            { name: '📢 Ads & Votes',      value: `Server Ads: **${activeServerAds}** active\nDM Ads: **${activeDmAds}** active\nActive Votes: **${activeVotes}**`, inline: true },
                            { name: '⚠️ Warns',            value: `Warned users: **${warnedUsers}**\nTotal warns: **${totalWarns}**`, inline: true },
                            { name: '👥 Server Members',   value: `Total: **${totalMembers}** (Humans: **${humanCount}** | Bots: **${botCount}**)\n🟢 Online: **${onlineCount}**`, inline: false },
                            { name: '📋 Server Channels',  value: `💬 Text: **${textChs}** | 🔊 Voice: **${voiceChs}** | 📁 Categories: **${catChs}**\nTotal Roles: **${roleCount}** | Boosts: **${boostCount}** (Tier **${boostTier}**)`, inline: false },
                            { name: '🔒 Security Systems', value: pLines.join(' • '), inline: false },
                            { name: '🛡️ Role Restrictions', value: restrictLines, inline: false },
                            { name: '💬 DM Override Settings', value: dmLines, inline: false }
                        )
                        .setFooter({ text: `Pro Robot v7.5 Control Panel • ${g.name}` })
                        .setTimestamp();
                    return await interaction.editReply({ embeds: [embed1] });
                }

                if (sub === 'security') {
                    const protection = options.getString('protection');
                    const action     = options.getString('action');
                    if (!protectionSettings.has(protection))
                        return await interaction.editReply({ content: '❌ Protection not found.' });
                    const newState = action === 'enable';
                    protectionSettings.set(protection, newState);
                    const name  = pNames[protection] || protection;
                    const state = newState ? '✅ **Enabled**' : '❌ **Disabled**';
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle('🔧 Security Updated')
                            .setDescription(`**${name}** has been set to ${state}`)
                            .setColor(newState ? '#2ecc71' : '#e74c3c')
                            .setFooter({ text: `Changed by ${interaction.user.tag || interaction.user.username}` }).setTimestamp()]
                    });
                }

                if (sub === 'presence') {
                    const mode = options.getString('mode');

                    // 🔄 RESTART — إعادة تشغيل اتصال البوت
                    if (mode === 'restart') {
                        await interaction.editReply({
                            embeds: [new EmbedBuilder()
                                .setTitle('🔄 Bot Restarting...')
                                .setDescription('The bot connection is restarting.\nIt will be back online in a few seconds.')
                                .setColor('#f1c40f').setTimestamp()]
                        });
                        sendDetailedLog(interaction.guild, 'Bot Restart Requested 🔄',
                            `<@${interaction.user.id}> requested a bot restart.\nBot will reconnect in ~3 seconds.`, '#f1c40f');
                        setTimeout(async () => {
                            try {
                                await client.destroy();
                                await client.login(BOT_TOKEN);
                            } catch (e) { console.error('Restart error:', e.message); }
                        }, 3000);
                        return;
                    }

                    const modeLabels = { online:'🟢 Online', idle:'🌙 Idle (Moon)', invisible:'⚫ Invisible', dnd:'🔴 Do Not Disturb' };
                    client.user.setPresence({ status: mode });
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle('✅ Bot Presence Updated')
                            .setDescription(`Bot is now set to **${modeLabels[mode] || mode}**`)
                            .setColor('#3498db').setTimestamp()]
                    });
                }

                if (sub === 'lockdown') {
                    const action       = options.getString('action');
                    const reason       = options.getString('reason') || (action === 'lock' ? 'Lockdown activated' : 'Lockdown lifted');
                    const textChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
                    const isLock       = action === 'lock';
                    for (const [, ch] of textChannels)
                        await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: isLock ? false : null }).catch(() => {});
                    const lockEmbed = new EmbedBuilder()
                        .setTitle(isLock ? '🔒 Server Locked' : '🔓 Server Unlocked')
                        .setDescription(isLock ? `All channels locked.\n**Reason:** ${reason}` : `All channels unlocked.\n**Reason:** ${reason}`)
                        .setColor(isLock ? '#e74c3c' : '#2ecc71')
                        .setFooter({ text: `By: ${interaction.user.username}` }).setTimestamp();
                    const logCh = interaction.guild.channels.cache.get(CONFIG.SUBMIT_LOG);
                    if (logCh) await logCh.send({ embeds: [lockEmbed] }).catch(() => {});
                    sendDetailedLog(interaction.guild, isLock ? 'Server Lockdown' : 'Server Unlocked', reason, isLock ? '#e74c3c' : '#2ecc71');
                    return await interaction.editReply({ content: isLock ? '🔒 All channels locked successfully.' : '🔓 All channels unlocked successfully.' });
                }

                if (sub === 'monitor-clear') {
                    const target = options.getString('target');
                    const user   = options.getUser('user');
                    if (target === 'warns_user') {
                        if (!user) return await interaction.editReply({ content: '❌ You must select a user for this option.' });
                        warnStorage.delete(user.id);
                        return await interaction.editReply({
                            embeds: [new EmbedBuilder().setTitle('🧹 Warns Cleared')
                                .setDescription(`All warns for <@${user.id}> have been cleared.`)
                                .setColor('#2ecc71').setTimestamp()]
                        });
                    }
                    if (target === 'warns_all') {
                        warnStorage.clear();
                        return await interaction.editReply({
                            embeds: [new EmbedBuilder().setTitle('🧹 All Warns Cleared')
                                .setDescription('Warn storage has been completely cleared for all users.')
                                .setColor('#2ecc71').setTimestamp()]
                        });
                    }
                    if (target === 'sessions') {
                        dmSettingsStorage.clear(); clearSessionStore.clear(); roleSessionStore.clear();
                        return await interaction.editReply({
                            embeds: [new EmbedBuilder().setTitle('🧹 Sessions Cleared')
                                .setDescription('All DM, clear, and role sessions have been cleared.')
                                .setColor('#2ecc71').setTimestamp()]
                        });
                    }
                    if (target === 'reset_all') {
                        warnStorage.clear(); dmSettingsStorage.clear(); clearSessionStore.clear();
                        roleSessionStore.clear(); spamTracker.clear(); raidTracker.clear(); voteStore.clear();
                        return await interaction.editReply({
                            embeds: [new EmbedBuilder().setTitle('🔄 Full Reset Complete')
                                .setDescription('All monitoring data has been cleared:\n• Warns\n• DM/Clear/Role Sessions\n• Spam Tracker\n• Raid Tracker\n• Vote Store')
                                .setColor('#e74c3c').setTimestamp()]
                        });
                    }
                    return;
                }

                if (sub === 'channel-info') {
                    const ch     = options.getChannel('channel');
                    const fullCh = guild.channels.cache.get(ch.id);
                    if (!fullCh) return await interaction.editReply({ content: '❌ Channel not found.' });
                    const typeMap    = { 0: '💬 Text', 2: '🔊 Voice', 4: '📁 Category', 5: '📢 Announcement', 13: '🎙️ Stage', 15: '📌 Forum', 16: '📒 Media' };
                    const chType    = typeMap[fullCh.type] || `Type ${fullCh.type}`;
                    const createdAt = `<t:${Math.floor(fullCh.createdTimestamp / 1000)}:D>`;
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle(`📋 Channel Info — #${fullCh.name}`)
                            .setColor('#3498db')
                            .addFields(
                                { name: '🆔 Channel ID', value: `\`${fullCh.id}\``,                                                     inline: true },
                                { name: '📂 Type',        value: chType,                                                                 inline: true },
                                { name: '📅 Created',     value: createdAt,                                                              inline: true },
                                { name: '📁 Category',    value: fullCh.parent?.name || '*None*',                                        inline: true },
                                { name: '🔢 Position',    value: `**${fullCh.rawPosition}**`,                                            inline: true },
                                { name: '🔒 NSFW',        value: fullCh.nsfw ? '⚠️ Yes' : '✅ No',                                       inline: true },
                                { name: '📝 Topic',       value: fullCh.topic || '*No topic set*',                                       inline: false },
                                { name: '⏱️ Slowmode',    value: fullCh.rateLimitPerUser ? `**${fullCh.rateLimitPerUser}s**` : '*None*', inline: true },
                                { name: '🌐 Mention',     value: `<#${fullCh.id}>`,                                                      inline: true }
                            )
                            .setFooter({ text: 'Pro Robot • Channel Inspector' }).setTimestamp()]
                    });
                }

                if (sub === 'member-info') {
                    const user      = options.getUser('user');
                    const member    = await guild.members.fetch(user.id).catch(() => null);
                    const joinedAt  = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : '*Unknown*';
                    const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`;
                    const roles     = member ? member.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).map(r => `<@&${r.id}>`).join(' ') || '*None*' : '*Unknown*';
                    const userWarns = warnStorage.get(user.id) || [];
                    const isBanned  = await guild.bans.fetch(user.id).then(() => true).catch(() => false);
                    const perms     = member ? member.permissions : null;
                    const isAdmin   = perms?.has(PermissionsBitField.Flags.Administrator) || false;
                    const isMod     = perms?.has(PermissionsBitField.Flags.KickMembers) || false;
                    const statusMap = { online: '🟢 Online', idle: '🌙 Idle', dnd: '🔴 DND', offline: '⚫ Offline' };
                    const status    = member?.presence?.status || 'offline';
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle(`👤 Member Info — ${user.username}`)
                            .setColor(member?.displayHexColor || '#2b2d31')
                            .setThumbnail(user.displayAvatarURL({ size: 256 }))
                            .addFields(
                                { name: '🆔 User ID',         value: `\`${user.id}\``,                                                    inline: true },
                                { name: '🤖 Bot',             value: user.bot ? '✅ Yes' : '❌ No',                                        inline: true },
                                { name: '📶 Status',          value: statusMap[status] || '⚫ Offline',                                    inline: true },
                                { name: '📅 Account Created', value: createdAt,                                                            inline: true },
                                { name: '📅 Joined Server',   value: joinedAt,                                                             inline: true },
                                { name: '⚠️ Warns',           value: `**${Array.isArray(userWarns) ? userWarns.length : 0}** warn(s)`,    inline: true },
                                { name: '🔨 Banned',          value: isBanned ? '✅ Yes' : '❌ No',                                        inline: true },
                                { name: '🛡️ Admin',           value: isAdmin ? '✅ Yes' : '❌ No',                                         inline: true },
                                { name: '⚔️ Moderator',       value: isMod ? '✅ Yes' : '❌ No',                                           inline: true },
                                { name: '🏷️ Nickname',        value: member?.nickname || '*None*',                                         inline: true },
                                { name: '🎨 Color',           value: member?.displayHexColor || '*None*',                                  inline: true },
                                { name: '🏅 Top Role',        value: member ? `<@&${member.roles.highest.id}>` : '*None*',                 inline: true },
                                { name: '🎭 Roles',           value: roles.length > 1024 ? roles.substring(0, 1020) + '...' : roles,       inline: false }
                            )
                            .setFooter({ text: 'Pro Robot • Member Inspector' }).setTimestamp()]
                    });
                }

                if (sub === 'warns') {
                    const user = options.getUser('user');
                    if (user) {
                        const userWarns = warnStorage.get(user.id) || [];
                        if (!Array.isArray(userWarns) || userWarns.length === 0)
                            return await interaction.editReply({ content: `✅ <@${user.id}> has no warns.` });
                        const warnLines = userWarns.map((w, i) =>
                            `**${i + 1}.** ${w.reason || 'No reason'} — *${new Date(w.timestamp || Date.now()).toISOString().slice(0, 10)}*`
                        ).join('\n');
                        return await interaction.editReply({
                            embeds: [new EmbedBuilder().setTitle(`⚠️ Warns for ${user.username}`)
                                .setDescription(warnLines).setColor('#f1c40f')
                                .setFooter({ text: `Total: ${userWarns.length} warn(s)` }).setTimestamp()]
                        });
                    } else {
                        if (warnStorage.size === 0) return await interaction.editReply({ content: '✅ No warns recorded for any user.' });
                        const allLines = Array.from(warnStorage.entries()).map(([uid, w]) =>
                            `<@${uid}> — **${Array.isArray(w) ? w.length : 0}** warn(s)`
                        ).join('\n');
                        return await interaction.editReply({
                            embeds: [new EmbedBuilder().setTitle('⚠️ All Warned Members')
                                .setDescription(allLines.length > 4000 ? allLines.slice(0, 3990) + '...' : allLines)
                                .setColor('#f1c40f')
                                .setFooter({ text: `${warnStorage.size} user(s) with warns` }).setTimestamp()]
                        });
                    }
                }

                return;
            }

            // ─ [COMMAND: reaction] ──────────────────────────────────────
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

            // ─ [COMMAND: role] ──────────────────────────────────────────
            if (commandName === 'role') {
                const targetRole = options.getRole('rank');
                const action     = options.getString('action');
                const target     = options.getString('target');
                const isGive     = action === 'give';
                if (target === 'everyone') {
                    const everyoneBtn = new ButtonBuilder()
                        .setCustomId(`role_everyone_${isGive ? 'give' : 'remove'}_${targetRole.id}`)
                        .setLabel(`🌐 ${isGive ? 'Give' : 'Remove'} @${targetRole.name} ${isGive ? 'to' : 'from'} all members`)
                        .setStyle(isGive ? ButtonStyle.Success : ButtonStyle.Danger);
                    const stopBtn = new ButtonBuilder().setCustomId('role_cancel').setLabel('Cancel ✖️').setStyle(ButtonStyle.Secondary);
                    return await interaction.editReply({
                        content: `⚠️ This will **${isGive ? 'assign' : 'remove'}** the **${targetRole.name}** role ${isGive ? 'to' : 'from'} **all** members. Confirm?`,
                        components: [new ActionRowBuilder().addComponents(everyoneBtn, stopBtn)]
                    });
                }
                if (target === 'select') {
                    const userSelector = new UserSelectMenuBuilder()
                        .setCustomId(`role_user_select_${isGive ? 'give' : 'remove'}_${targetRole.id}`)
                        .setPlaceholder(`☑️ Select members to ${isGive ? 'give' : 'remove'} the role ${isGive ? 'to' : 'from'}`)
                        .setMinValues(1).setMaxValues(25);
                    roleSessionStore.set(interaction.user.id, { roleId: targetRole.id, action });
                    return await interaction.editReply({
                        content: `☑️ Select the members you want to **${isGive ? 'give' : 'remove'}** the **${targetRole.name}** role ${isGive ? 'to' : 'from'}:`,
                        components: [new ActionRowBuilder().addComponents(userSelector)]
                    });
                }
            }

            // ─ [COMMAND: security-status] ───────────────────────────────
            if (commandName === 'security-status') {
                const protectionNames = {
                    antiSpam:'🛡️ Anti-Spam', antiRaid:'🚨 Anti-Raid', antiLink:'🔗 Anti-Link',
                    antiCaps:'🔤 Anti-Caps', antiMassMention:'📢 Anti-Mass-Mention', antiBadWord:'🤬 Anti-Bad-Word',
                    newAccountProtection:'👶 New Account Protection', vpnProtection:'🌐 VPN Protection',
                    antiWebhook:'🔗 Anti-Webhook', antiBot:'🤖 Anti-Suspicious-Bot', antiTokenGrab:'🛡️ Anti-Token-Grab',
                    sync:'🔄 Sync System'
                };
                const protectionDescriptions = {
                    antiSpam:'Times out users who send messages too fast.',
                    antiRaid:'Locks server if too many members join quickly.',
                    antiLink:'Deletes unauthorized links and Discord invites.',
                    antiCaps:'Deletes messages written mostly in capital letters.',
                    antiMassMention:'Bans users who mass-mention members or roles.',
                    antiBadWord:'Times out/bans users who use bad words.',
                    newAccountProtection:'Kicks accounts less than 7 days old.',
                    vpnProtection:'Bans members detected as using a VPN.',
                    antiWebhook:'Deletes unauthorized webhooks automatically.',
                    antiBot:'Detects and bans suspicious/hacker bots.',
                    antiTokenGrab:'Blocks token grabbing and IP logger links.',
                    sync:'Tracks all bot actions and auto-syncs every Thursday.'
                };
                const lines = Array.from(protectionSettings.entries()).map(([key, enabled]) =>
                    `${protectionNames[key] || key}\n╰ ${enabled ? '✅ **ON**' : '❌ **OFF**'} — *${protectionDescriptions[key] || ''}*`
                );
                return await interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle('🔒 Pro Robot — Security Status v7.5')
                        .setDescription(lines.join('\n\n')).setColor('#2b2d31')
                        .setFooter({ text: 'Use /pro-robot security to toggle protections.' }).setTimestamp()]
                });
            }

            // ─ [COMMAND: send] ──────────────────────────────────────────
            if (commandName === 'send') {
                const msg           = options.getString('message');
                const style         = options.getString('style');
                const delay         = options.getInteger('delay_send');
                const delAfter      = options.getInteger('delete_after');
                const color         = validateHexColor(options.getString('color') || '#3498db');
                const replyLink     = options.getString('reply_to') || null;
                const targetChannel = options.getChannel('target_channel') || null;
                const sendTo        = targetChannel ? (guild.channels.cache.get(targetChannel.id) || channel) : channel;

                let replyChId  = null;
                let replyMsgId = null;
                if (replyLink) {
                    const lp = replyLink.split('/');
                    replyChId  = lp[lp.length - 2];
                    replyMsgId = lp[lp.length - 1];
                }

                const delayStr = delay === 0 ? 'now' : `in ${delay} minute(s)`;
                await interaction.editReply({ content: `✅ Message will be sent ${delayStr}${targetChannel ? ` to <#${targetChannel.id}>` : ''}.` });

                setTimeout(async () => {
                    try {
                        let replyMsgObj = null;
                        if (replyMsgId && replyChId) {
                            const rc = await client.channels.fetch(replyChId).catch(() => null);
                            replyMsgObj = rc ? await rc.messages.fetch(replyMsgId).catch(() => null) : null;
                        }
                        const sendOpts = style === 'embed'
                            ? { embeds: [new EmbedBuilder().setDescription(msg).setColor(color)] }
                            : { content: msg };
                        let sent;
                        if (replyMsgObj) {
                            sent = await replyMsgObj.reply(sendOpts).catch(() => sendTo.send(sendOpts).catch(() => {}));
                        } else {
                            sent = await sendTo.send(sendOpts).catch(() => {});
                        }
                        if (sent && delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
                    } catch (e) { console.error('send command error:', e.message); }
                }, delay * 60000);
            }

            // ─ [COMMAND: server-info] ───────────────────────────────────
            if (commandName === 'server-info') {
                const g            = interaction.guild;
                if (!g) return await interaction.editReply({ content: '❌ This command must be used in a server.' });
                const totalMembers = g.memberCount;
                const channelCount = g.channels.cache.size;
                const roleCount    = g.roles.cache.size;
                const boostCount   = g.premiumSubscriptionCount || 0;
                const boostTier    = g.premiumTier || 0;
                const createdAt    = `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`;
                const owner        = await g.fetchOwner().catch(() => null);
                const verificationLevels = ['None', 'Low', 'Medium', 'High', 'Very High'];
                const textChannels  = g.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
                const voiceChannels = g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
                return await interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle(`🏠 ${g.name} — Server Info`).setColor('#3498db')
                        .addFields(
                            { name: '👑 Owner',          value: owner ? `<@${owner.id}>` : 'Unknown',             inline: true },
                            { name: '🌍 Server Region',  value: 'Egypt',                                           inline: true },
                            { name: '📅 Created',        value: createdAt,                                         inline: true },
                            { name: '👥 Members',        value: `**${totalMembers}** total members`,               inline: true },
                            { name: '💬 Text Channels',  value: `**${textChannels}** channels`,                    inline: true },
                            { name: '🔊 Voice Channels', value: `**${voiceChannels}** channels`,                   inline: true },
                            { name: '🎭 Roles',          value: `**${roleCount}** roles`,                          inline: true },
                            { name: '💎 Boosts',         value: `**${boostCount}** boosts (Tier **${boostTier}**)`, inline: true },
                            { name: '🔒 Verification',   value: `**${verificationLevels[g.verificationLevel] || 'Unknown'}**`, inline: true },
                            { name: '🤖 Bot',            value: `<@${CONFIG.BOT_ID}>`,                             inline: true },
                            { name: '📋 Server ID',      value: `\`${g.id}\``,                                    inline: true },
                            { name: '📌 Extra Info',     value: extraServerInfo || 'No recent updates.',           inline: false }
                        )
                        .setFooter({ text: 'Pro Robot v7.5 • Pro Server | This message is only visible to you.' }).setTimestamp()]
                });
            }

            // ─ [COMMAND: server-status] ─────────────────────────────────
            if (commandName === 'server-status') {
                const g              = interaction.guild;
                if (!g) return await interaction.editReply({ content: '❌ This command must be used in a server.' });
                const members        = await g.members.fetch().catch(() => null);
                const totalMembers   = g.memberCount;
                const botCount       = members ? members.filter(m => m.user.bot).size : 0;
                const humanCount     = totalMembers - botCount;
                const onlineMembers  = members ? members.filter(m => m.presence?.status === 'online').size : 0;
                const idleMembers    = members ? members.filter(m => m.presence?.status === 'idle').size : 0;
                const dndMembers     = members ? members.filter(m => m.presence?.status === 'dnd').size : 0;
                const offlineMembers = Math.max(0, humanCount - onlineMembers - idleMembers - dndMembers);
                const channelCount   = g.channels.cache.size;
                const roleCount      = g.roles.cache.size;
                const boostCount     = g.premiumSubscriptionCount || 0;
                const boostTier      = g.premiumTier || 0;
                const createdAt      = `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`;
                const auditLogs      = await g.fetchAuditLogs({ limit: 10 }).catch(() => null);
                const violations     = auditLogs?.entries
                    .filter(e => [24, 20, 22].includes(e.action))
                    .map(e => {
                        const actionName = e.action === 24 ? '🤐 Timeout' : e.action === 20 ? '👢 Kick' : '🚫 Ban';
                        const executor   = e.executor ? `<@${e.executor.id}>` : 'Unknown';
                        const target     = e.target   ? `<@${e.target.id}>`   : 'Unknown';
                        return `• ${actionName} ${target} by ${executor}\n  └ Reason: **${e.reason || 'No reason provided'}**`;
                    }).join('\n') || '✅ No recent violations found.';
                const issues = [];
                if (boostTier === 0)     issues.push('⚠️ No active Server Boost');
                if (channelCount > 50)   issues.push('⚠️ High channel count — consider organizing');
                if (roleCount > 30)      issues.push('⚠️ High role count — consider cleanup');
                const healthStatus = issues.length === 0 ? '✅ All systems operational' : issues.join('\n');
                return await interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#2b2d31').setTitle(`📊 Server Status Report — ${g.name}`)
                        .addFields(
                            { name: '👥 Members', value: `Total: **${totalMembers}** (Humans: **${humanCount}** | Bots: **${botCount}**)\n🟢 Online: **${onlineMembers}** 🟡 Idle: **${idleMembers}** 🔴 DND: **${dndMembers}** ⚫ Offline: **${offlineMembers}**`, inline: false },
                            { name: '📋 Server Info', value: `Channels: **${channelCount}** | Roles: **${roleCount}**\nBoosts: **${boostCount}** (Tier **${boostTier}**)\nCreated: ${createdAt}`, inline: false },
                            { name: '🔍 Server Health', value: healthStatus, inline: false },
                            { name: '🚫 Recent Actions', value: violations.length > 1024 ? violations.substring(0, 1020) + '...' : violations, inline: false }
                        )
                        .setFooter({ text: '🔒 This report is private and only visible to you.' }).setTimestamp()]
                });
            }

            // ─ [COMMAND: setup-form] ────────────────────────────────────
            if (commandName === 'setup-form') {
                const messageText   = options.getString('message_text');
                const isBox         = options.getBoolean('is_box');
                const btn1Name      = options.getString('btn1_name');
                const btn1Color     = options.getString('btn1_color');
                const btn2Name      = options.getString('btn2_name') || null;
                const btn2Color     = options.getString('btn2_color') || 'Primary';
                const btn3Name      = options.getString('btn3_name') || null;
                const btn3Color     = options.getString('btn3_color') || 'Secondary';
                const embedColorRaw = options.getString('embed_color') || '#FFD700';
                const embedColor    = validateHexColor(embedColorRaw);
                const targetChannel = options.getChannel('target_channel');
                const resultIsBox   = options.getBoolean('result_is_box');
                const sendToDM      = options.getBoolean('send_to_dm') || false;
                const dmUser        = options.getUser('dm_user');
                const fields        = [];
                for (let i = 1; i <= 5; i++) { const fn = options.getString(`field_${i}_name`); if (fn) fields.push(fn); }
                const btnColorMap   = { 'Primary': ButtonStyle.Primary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger, 'Secondary': ButtonStyle.Secondary };
                const ts     = Date.now();
                const formId1 = `form_${ts}_1`;
                const formId2 = btn2Name ? `form_${ts}_2` : null;
                const formId3 = btn3Name ? `form_${ts}_3` : null;
                formSettingsDB.set(formId1, { fields, resultIsBox, targetChannel: targetChannel.id });
                if (formId2) formSettingsDB.set(formId2, { fields, resultIsBox, targetChannel: targetChannel.id });
                if (formId3) formSettingsDB.set(formId3, { fields, resultIsBox, targetChannel: targetChannel.id });
                const btns = [new ButtonBuilder().setCustomId(formId1).setLabel(btn1Name).setStyle(btnColorMap[btn1Color] || ButtonStyle.Primary)];
                if (btn2Name && formId2) btns.push(new ButtonBuilder().setCustomId(formId2).setLabel(btn2Name).setStyle(btnColorMap[btn2Color] || ButtonStyle.Primary));
                if (btn3Name && formId3) btns.push(new ButtonBuilder().setCustomId(formId3).setLabel(btn3Name).setStyle(btnColorMap[btn3Color] || ButtonStyle.Secondary));
                const row = new ActionRowBuilder().addComponents(btns);
                if (sendToDM) {
                    if (!dmUser) return await interaction.editReply({ content: '❌ Select a user in `dm_user` when `send_to_dm` is true.' });
                    try {
                        const dmChannel = await dmUser.createDM();
                        if (isBox) await dmChannel.send({ embeds: [new EmbedBuilder().setColor(embedColor).setDescription(messageText)], components: [row] });
                        else await dmChannel.send({ content: messageText, components: [row] });
                        return await interaction.editReply({ content: `✅ Form button(s) sent to **${dmUser.username}**'s DM!` });
                    } catch { return await interaction.editReply({ content: `❌ Could not DM **${dmUser.username}**. DMs may be disabled.` }); }
                }
                await interaction.editReply({ content: `✅ Done! Form sent with **${btns.length}** button(s).` });
                if (isBox) await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(embedColor).setDescription(messageText)], components: [row] }).catch(() => {});
                else await interaction.channel.send({ content: messageText, components: [row] }).catch(() => {});
                return;
            }

            // ─ [COMMAND: slash-control] — إصلاح كامل مع حفظ دائم ──────
            if (commandName === 'slash-control') {
                const targetCmd = options.getString('command_name');
                const action    = options.getString('action');
                if (action === 'restrict') {
                    const role = options.getRole('allowed_role');
                    if (!role) return await interaction.editReply({ content: '❌ You must select an `allowed_role` when using restrict.' });
                    cmdPermissions.set(targetCmd, role.id);
                    savePersistedPermissions(); // حفظ دائم
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle('🔒 Command Restricted')
                            .setDescription(`Command \`/${targetCmd}\` is now restricted to <@&${role.id}>.\n\n✅ Members with this role can use it.\n❌ Others will be denied.\n💾 This restriction is **saved permanently** and survives bot restarts.`)
                            .setColor('#e74c3c').setTimestamp()]
                    });
                }
                if (action === 'remove') {
                    if (!cmdPermissions.has(targetCmd))
                        return await interaction.editReply({ content: `⚠️ No restriction found for \`/${targetCmd}\`.` });
                    cmdPermissions.delete(targetCmd);
                    savePersistedPermissions(); // حفظ دائم
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle('🔓 Restriction Removed')
                            .setDescription(`Restriction removed from \`/${targetCmd}\`.\nOnly the server owner can use it now.\n💾 Change saved permanently.`)
                            .setColor('#2ecc71').setTimestamp()]
                    });
                }
                if (action === 'dm_enable') {
                    dmCommandSettings.set(targetCmd, true);
                    return await interaction.editReply({ content: `✅ \`/${targetCmd}\` is now **allowed in DMs** at runtime.\n⚠️ Note: Discord requires bot re-registration to fully reflect DM access changes.` });
                }
                if (action === 'dm_disable') {
                    dmCommandSettings.set(targetCmd, false);
                    return await interaction.editReply({ content: `✅ \`/${targetCmd}\` is now **blocked in DMs** at runtime.` });
                }
            }

            // ─ [COMMAND: sync] ──────────────────────────────────────────
            if (commandName === 'sync') {
                const action = options.getString('action');
                if (action === 'enable') {
                    protectionSettings.set('sync', true);
                    syncThursdayEnabled = true;
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle('🔄 Sync System Enabled')
                            .setDescription('The sync system is now **active**.\n• All bot actions will be tracked.\n• Auto-sync will run every Thursday automatically.')
                            .setColor('#2ecc71').setTimestamp()]
                    });
                }
                if (action === 'disable') {
                    protectionSettings.set('sync', false);
                    syncThursdayEnabled = false;
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle('🔄 Sync System Disabled')
                            .setDescription('The sync system has been **disabled**.')
                            .setColor('#e74c3c').setTimestamp()]
                    });
                }
                if (action === 'log') {
                    if (syncLog.length === 0) return await interaction.editReply({ content: '📋 No sync events recorded yet.' });
                    const logLines = syncLog.slice(-20).map((entry, i) =>
                        `**${i + 1}.** \`${entry.timestamp.slice(0, 19).replace('T', ' ')}\`\n╰ **${entry.action}**: ${entry.details}`
                    ).join('\n\n');
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle('📋 Sync Log — Last 20 Events')
                            .setDescription(logLines.length > 4000 ? logLines.slice(0, 3990) + '...' : logLines)
                            .setColor('#3498db').setFooter({ text: `Total: ${syncLog.length} events` }).setTimestamp()]
                    });
                }
                if (action === 'run') {
                    if (!protectionSettings.get('sync'))
                        return await interaction.editReply({ content: '❌ Sync is currently **disabled**. Enable it first with /sync enable.' });
                    const syncResults = await runAutoSync(guild) || [];
                    recordSync('MANUAL_SYNC', `Manual sync by ${interaction.user.tag || interaction.user.username}. ${syncResults.length} checks.`);
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle('🔄 Sync Complete — System Check Report')
                            .setDescription(syncResults.length > 0 ? syncResults.join('\n') : '✅ All checks passed.')
                            .setColor('#3498db')
                            .setFooter({ text: `Sync by ${interaction.user.tag || interaction.user.username}` }).setTimestamp()]
                    });
                }
                return;
            }

            // ─ [COMMAND: translate] ─────────────────────────────────────
            if (commandName === 'translate') {
                try {
                    const res  = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${options.getString('to').toLowerCase()}&dt=t&q=${encodeURIComponent(options.getString('text'))}`);
                    const json = await res.json();
                    return await interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle('🌐 Translation').setDescription(json[0].map(i => i[0]).join('')).setColor('#4285F4')]
                    });
                } catch {
                    return await interaction.editReply({ content: '❌ Translation failed. Check the language code.' });
                }
            }

            // ─ [COMMAND: vote] ──────────────────────────────────────────
            if (commandName === 'vote') {
                const question   = options.getString('question');
                const embedColor = validateHexColor(options.getString('embed_color') || '#f1c40f');
                const colorMap   = { 'Primary': ButtonStyle.Primary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger, 'Secondary': ButtonStyle.Secondary };
                const voteId     = `vote_${Date.now()}`;
                const btns       = [];
                for (let i = 1; i <= 5; i++) {
                    const lbl = options.getString(`btn${i}_label`);
                    if (!lbl) break;
                    const clr = options.getString(`btn${i}_color`) || 'Primary';
                    btns.push(new ButtonBuilder()
                        .setCustomId(`${voteId}_opt${i}`)
                        .setLabel(lbl)
                        .setStyle(colorMap[clr] || ButtonStyle.Primary));
                }
                if (btns.length === 0) btns.push(
                    new ButtonBuilder().setCustomId(`${voteId}_opt1`).setLabel('Yes ✅').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`${voteId}_opt2`).setLabel('No ❌').setStyle(ButtonStyle.Danger)
                );
                voteStore.set(voteId, { question, votes: {}, labels: btns.map(b => b.data.label), embedColor });
                const row = new ActionRowBuilder().addComponents(btns);
                return await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle('📊 New Vote')
                        .setDescription(`**${question}**\n\n${btns.map(b => `${b.data.label}: **0**`).join('  •  ')}`)
                        .setColor(embedColor)
                        .setFooter({ text: 'Click a button to cast your vote!' })],
                    components: [row]
                });
            }

            // ─ [COMMAND: vpn] ───────────────────────────────────────────
            if (commandName === 'vpn') {
                const status   = options.getString('status');
                const newState = status === 'enable';
                protectionSettings.set('vpnProtection', newState);
                recordSync('VPN_TOGGLE', `VPN Protection → ${newState ? 'ON' : 'OFF'} by ${interaction.user.tag || interaction.user.username}`);
                const targetGuild = guild || client.guilds.cache.first();
                if (targetGuild) sendDetailedLog(targetGuild, 'VPN Protection Changed 🌐',
                    `VPN Protection was set to ${newState ? '✅ **Enabled**' : '❌ **Disabled**'} by <@${interaction.user.id}>`,
                    newState ? '#2ecc71' : '#e74c3c');
                return await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle('🌐 VPN Protection Updated')
                        .setDescription(newState
                            ? '✅ **VPN Protection is now ON.**\nAny member detected as using a VPN will be **automatically banned** when joining the server.'
                            : '❌ **VPN Protection is now OFF.**\nVPN detection is disabled.')
                        .setColor(newState ? '#2ecc71' : '#e74c3c')
                        .setFooter({ text: `Changed by ${interaction.user.tag || interaction.user.username}` })
                        .setTimestamp()]
                });
            }

        } catch (e) {
            console.error('Command Error:', e.message);
            if (interaction.deferred) await interaction.editReply('❌ An error occurred. Please try again.').catch(() => {});
            else if (!interaction.replied) await interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
        }

    } catch (outerError) {
        console.error('Interaction handler outer error:', outerError.message);
    }
});

// ═══════════════════════════════════════════════════
// 👋  JOIN / LEAVE — دخول وخروج الأعضاء
// ═══════════════════════════════════════════════════
client.on('guildMemberAdd', async (member) => {
    try {
        // فحص البوتات الخطيرة أولاً
        if (member.user.bot) {
            await checkSuspiciousBot(member, member.guild);
            return;
        }

        // Anti-Raid
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
                        .setDescription(`**Raid detected** — ${raidData.joins.length} members joined in less than ${RAID_WINDOW / 1000} seconds!\nServer has been locked. Use **/pro-robot lockdown** with action \`unlock\` to unlock.`)
                        .setColor('#c0392b').setTimestamp();
                    await logCh.send({ content: `<@${CONFIG.OWNER_ID}>`, embeds: [raidEmbed] }).catch(() => {});
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

        // VPN Protection
        if (protectionSettings.get('vpnProtection')) {
            try {
                const isVPN = await checkVPN(member.user.id);
                if (isVPN) {
                    await member.ban({ reason: 'VPN detected — VPN Protection is enabled' }).catch(() => {});
                    await sendModDM(member.user, '🚫 Banned — VPN Detected',
                        `You have been banned from **${member.guild.name}** because you appear to be using a VPN.`,
                        member.guild.name);
                    sendDetailedLog(member.guild, '🌐 VPN Ban', `<@${member.id}> was banned — VPN/proxy detected.`, '#c0392b');
                    recordSync('VPN_BAN', `User <@${member.id}> banned for VPN.`);
                    return;
                }
            } catch (e) { console.error('VPN check error:', e.message); }
        }

        // New Account Protection
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

        // Auto-Role
        await member.roles.add([CONFIG.AUTO_ROLE, CONFIG.AUTO_ROLE_2]).catch(() => {});
        recordSync('AUTO_ROLE', `Auto-roles assigned to <@${member.id}>.`);

        // Welcome Message — تُحذف بعد 24 ساعة تلقائياً
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
                    `→ <#${CONFIG.ROLE_CHANNEL}> | <#1482901664951304222>\n` +
                    `[¡}================{!}================[¡}\n` +
                    `Thank you! ❤️`)
                .setColor('#3498db').setTimestamp();
            const m = await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] }).catch(() => null);
            // حذف رسالة الترحيب بعد 24 ساعة تلقائياً
            if (m) setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
        }

        // Welcome DM
        await sendModDM(member.user, '🎉 Welcome to Pro Server!',
            `Hey **${member.user.username}**! 👋\nYou have successfully joined **Pro Server**. Enjoy your stay!`,
            member.guild.name);

        updateLiveInfo(member.guild);
    } catch (e) { console.error('guildMemberAdd error:', e.message); }
});

client.on('guildMemberRemove', async (member) => {
    try {
        sendDetailedLog(member.guild, 'Member Left 👥', `User: **${member.user.tag || member.user.username}** (\`${member.user.id}\`) left the server.`, '#e74c3c');
        updateLiveInfo(member.guild);
    } catch (e) { console.error('guildMemberRemove error:', e.message); }
});

// ═══════════════════════════════════════════════════
// 📊  LIVE INFO — معلومات السيرفر المباشرة
// ═══════════════════════════════════════════════════
async function updateLiveInfo(guild) {
    try {
        if (!guild) guild = client.guilds.cache.first();
        if (!guild) return;
        const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
        if (!infoCh) return;
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
        const msgs = await infoCh.messages.fetch({ limit: 10 }).catch(() => null);
        if (msgs) msgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));
        await infoCh.send({ content: '@everyone', embeds: [infoEmbed] }).catch(() => {});
    } catch (e) { console.error('updateLiveInfo error:', e.message); }
}

// ═══════════════════════════════════════════════════
// 🤖  AUTOMOD — قواعد AutoMod تلقائية
// ═══════════════════════════════════════════════════
async function setupAutoModRule(guild) {
    try {
        const existingRules = await guild.autoModerationRules.fetch().catch(() => null);
        if (existingRules?.find(r => r.name === 'Pro Robot — Word Filter')) return;
        await guild.autoModerationRules.create({
            name: 'Pro Robot — Word Filter',
            eventType: 1,
            triggerType: 1,
            triggerMetadata: { keywordFilter: BAD_WORDS, regexPatterns: [] },
            actions: [{ type: 1, metadata: { customMessage: '🚫 This message was blocked by Pro Robot AutoMod.' } }],
            enabled: true,
            reason: 'Pro Robot AutoMod integration v7.5'
        });
        console.log(`AutoMod rule created in: ${guild.name}`);
        recordSync('AUTOMOD_RULE_CREATED', `AutoMod rule created in ${guild.name}`);
    } catch (err) {
        console.error(`Failed to create AutoMod rule in ${guild.name}:`, err.message);
    }
}

client.on('guildCreate', async (guild) => {
    console.log(`Joined new guild: ${guild.name}`);
    await setupAutoModRule(guild);
    await checkAndKillWebhooks(guild); // فحص الـ webhooks عند دخول سيرفر جديد
});

// ═══════════════════════════════════════════════════
// 🛡️  CRASH PROTECTION v7.5 — حماية من الأعطال
// ═══════════════════════════════════════════════════
process.on('unhandledRejection', (error) => {
    const msg     = error?.message || String(error);
    const safeMsg = msg.replace(/MTQ[A-Za-z0-9._-]{50,}/g, '[TOKEN_HIDDEN]');
    console.error('[CRASH PROTECTION v7.5] Unhandled promise rejection:', safeMsg);
    logSecurityEvent('UNHANDLED_REJECTION', safeMsg.slice(0, 300));
});

process.on('uncaughtException', (error) => {
    const msg     = error?.message || String(error);
    const safeMsg = msg.replace(/MTQ[A-Za-z0-9._-]{50,}/g, '[TOKEN_HIDDEN]');
    console.error('[CRASH PROTECTION v7.5] Uncaught exception:', safeMsg);
    logSecurityEvent('UNCAUGHT_EXCEPTION', safeMsg.slice(0, 300));
    // لا نوقف البوت — يستمر في العمل
});

// منع إيقاف البوت عن طريق SIGTERM من مصدر خارجي
process.on('SIGTERM', () => {
    console.warn('[SECURITY v7.5] SIGTERM received — bot staying alive.');
    logSecurityEvent('SIGTERM_BLOCKED', 'External SIGTERM signal blocked.');
});

process.on('SIGINT', () => {
    console.warn('[SECURITY v7.5] SIGINT received — bot staying alive.');
});

// ═══════════════════════════════════════════════════
// ⏰  PERIODIC TASKS — المهام الدورية
// ═══════════════════════════════════════════════════
setInterval(() => {
    const now = Date.now();
    // تنظيف الـ rate-limit القديم
    for (const [uid, times] of commandCooldowns.entries()) {
        const fresh = times.filter(t => now - t < COOLDOWN_WINDOW_MS);
        if (fresh.length === 0) commandCooldowns.delete(uid);
        else commandCooldowns.set(uid, fresh);
    }
    // تنظيف الـ mass-action القديم
    for (const [uid, data] of massActionTracker.entries()) {
        const fresh = data.actions.filter(a => now - a.time < MASS_ACTION_WINDOW);
        if (fresh.length === 0) massActionTracker.delete(uid);
        else data.actions = fresh;
    }
    // تنظيف colorPickerStore القديم (أكثر من 10 دقائق)
    for (const [key, val] of colorPickerStore.entries()) {
        if (!val._time) val._time = now;
        if (now - val._time > 10 * 60 * 1000) colorPickerStore.delete(key);
    }
}, 60000);

// ── Auto-Sync Every 5 Minutes (when enabled) + Thursday Deep Sync ──
let lastSyncMinute = -1; // منع التكرار في نفس الدقيقة
setInterval(async () => {
    if (!syncThursdayEnabled || !protectionSettings.get('sync')) return;
    const now     = new Date();
    const nowMin  = now.getMinutes();

    // 🔄 Comprehensive sync every 5 minutes when enabled
    if (nowMin !== lastSyncMinute) {
        lastSyncMinute = nowMin;
        const guild = client.guilds.cache.first();
        if (guild) {
            try {
                // ── Check all members for missing auto-roles ──
                const members = await guild.members.fetch().catch(() => null);
                if (members) {
                    for (const [, member] of members) {
                        if (member.user.bot) continue;
                        if (CONFIG.AUTO_ROLE   && !member.roles.cache.has(CONFIG.AUTO_ROLE))
                            await member.roles.add(CONFIG.AUTO_ROLE).catch(() => {});
                        if (CONFIG.AUTO_ROLE_2 && !member.roles.cache.has(CONFIG.AUTO_ROLE_2))
                            await member.roles.add(CONFIG.AUTO_ROLE_2).catch(() => {});
                    }
                }
                // ── Thursday 2AM deep sync log ──
                const isThursday  = now.getDay() === 4;
                const isNightTime = now.getHours() === 2 && now.getMinutes() < 5;
                if (isThursday && isNightTime) {
                    console.log('[AUTO-SYNC] Thursday deep sync running...');
                    await runAutoSync(guild);
                    recordSync('THURSDAY_AUTO_SYNC', `Automatic Thursday deep sync completed at ${now.toISOString()}`);
                }
            } catch (e) { console.error('[AUTO-SYNC] Error:', e.message); }
        }
    }
}, 5 * 60 * 1000); // كل 5 دقائق

// ─────────────────────────────────────────────────────────────────────────────
// Bot Login
// ─────────────────────────────────────────────────────────────────────────────
client.login(BOT_TOKEN);
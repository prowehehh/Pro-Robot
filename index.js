const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle, AuditLogEvent,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

app.get('/', (req, res) => res.send('Pro Robot is Online! 🤖'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

const CONFIG = {
    WELCOME_CH:   '1482881348204101768',
    AUTO_ROLE:    '1482883802186514615',
    AUTO_ROLE_2:  '1499510435639197887',
    OWNER_ID:     '1134146616857731173',
    BOT_ID:       '1495419259147386920',
    HELP_CH:      '1497909981725593712',
    SUBMIT_LOG:   '1494367980702797935',
    ROLE_CHANNEL: '1482874761951576228',
    INFO_CH:      '1484641160394702958'
};

const adsStorage   = new Map();
const warnStorage  = new Map();
const ADMIN_PASSWORD = "Pro@Robot510";
let   extraServerInfo = "";

// ============================================================
// 🛡️ PROTECTION SYSTEM — متقدم ومتعدد الطبقات
// ============================================================
const protectionConfig = {
    enabled:          true,
    antiSpam:         true,   // مانع الرسائل المتكررة السريعة
    antiRaid:         true,   // مانع الريد (انضمام كثيف مفاجئ)
    antiLinks:        true,   // مانع الروابط لغير المشرفين
    antiMassMention:  true,   // مانع منشن كتير
    antiCaps:         true,   // مانع الكابس الزيادة
    raidThreshold:    10,     // عدد الانضمامات في 10 ثواني لتفعيل مانع الريد
    spamThreshold:    5,      // عدد رسائل في 5 ثواني
    mentionThreshold: 5,      // عدد منشنات في رسالة واحدة
    capsPercent:      70,     // نسبة الكابس المسموحة
};

// إعدادات يتحكم فيها الأونر عبر /control bot
const botSettings = {
    aiEnabled:       true,
    welcomeEnabled:  true,
    autoModEnabled:  true,
    radarEnabled:    true,
    logEnabled:      true,
    language:        'auto',  // auto = يكتشف لغة المستخدم تلقائياً
};

const spamMap      = new Map(); // userId → [{time}]
const raidTracker  = [];        // أوقات الانضمام للكشف عن الريد
let   raidLockdown = false;

// ──────────────────────────────────────────────
// فحص Anti-Spam
// ──────────────────────────────────────────────
function checkSpam(userId) {
    const now  = Date.now();
    const msgs = (spamMap.get(userId) || []).filter(t => now - t < 5000);
    msgs.push(now);
    spamMap.set(userId, msgs);
    return msgs.length >= protectionConfig.spamThreshold;
}

// ──────────────────────────────────────────────
// فحص Anti-Raid
// ──────────────────────────────────────────────
function checkRaid() {
    const now = Date.now();
    raidTracker.push(now);
    const recent = raidTracker.filter(t => now - t < 10000);
    raidTracker.length = 0;
    raidTracker.push(...recent);
    return recent.length >= protectionConfig.raidThreshold;
}

// ──────────────────────────────────────────────
// فحص الكابس
// ──────────────────────────────────────────────
function checkCaps(content) {
    if (content.length < 10) return false;
    const upper = content.replace(/[^A-Za-z]/g, '');
    if (upper.length < 5) return false;
    const capsRatio = (upper.split('').filter(c => c === c.toUpperCase()).length / upper.length) * 100;
    return capsRatio >= protectionConfig.capsPercent;
}

// ──────────────────────────────────────────────
// اكتشاف اللغة وإضافتها للـ prompt
// ──────────────────────────────────────────────
function detectLanguageHint(text) {
    const arabicPattern  = /[\u0600-\u06FF]/;
    const frenchPattern  = /[àâçéèêëîïôùûüÿœæ]/i;
    const spanishPattern = /[áéíóúüñ¿¡]/i;
    const turkishPattern = /[şğüçöı]/i;

    if (arabicPattern.test(text))  return 'Arabic (Egyptian dialect preferred). Respond fully in Arabic.';
    if (frenchPattern.test(text))  return 'French. Respond fully in French.';
    if (spanishPattern.test(text)) return 'Spanish. Respond fully in Spanish.';
    if (turkishPattern.test(text)) return 'Turkish. Respond fully in Turkish.';
    return 'English or detect the language automatically and respond in the same language.';
}

// ============================================================
// 🧠 LIVE SERVER MEMORY
// ============================================================
const liveMemory = {
    recentEvents:   [],
    userActivity:   new Map(),  // userId → {channels, actions, lastSeen}
    members: {
        totalJoins:  0, totalLeaves: 0, totalBans: 0,
        lastJoined: null, lastLeft: null, lastBanned: null,
    },
    server: {
        nameChanges: 0, iconChanged: false,
        channelsCreated: 0, channelsDeleted: 0,
        rolesCreated: 0, rolesDeleted: 0,
    },
    roles:       { totalAdded: 0, totalRemoved: 0, lastRoleAction: null },
    lastUpdated: null
};

function recordRadarEvent(type, detail, meta = {}) {
    const event = {
        type, detail, meta,
        time: new Date().toLocaleString('en-EG', { timeZone: 'Africa/Cairo' })
    };
    liveMemory.recentEvents.unshift(event);
    if (liveMemory.recentEvents.length > 30) liveMemory.recentEvents.pop();
    liveMemory.lastUpdated = event.time;

    // تحديث نشاط الشخص
    if (meta.userId) {
        const uid  = meta.userId;
        const prev = liveMemory.userActivity.get(uid) || { channels: new Set(), actions: [], tag: meta.userTag || uid };
        prev.actions.unshift({ type, detail, time: event.time });
        if (prev.actions.length > 20) prev.actions.pop();
        if (meta.channelId) prev.channels.add(meta.channelId);
        prev.lastSeen = event.time;
        liveMemory.userActivity.set(uid, prev);
    }

    if (type === 'MEMBER_JOIN')    { liveMemory.members.totalJoins++;   liveMemory.members.lastJoined  = meta.user || null; }
    if (type === 'MEMBER_LEAVE')   { liveMemory.members.totalLeaves++;  liveMemory.members.lastLeft    = meta.user || null; }
    if (type === 'MEMBER_BAN')     { liveMemory.members.totalBans++;    liveMemory.members.lastBanned  = meta.user || null; }
    if (type === 'CHANNEL_CREATE') liveMemory.server.channelsCreated++;
    if (type === 'CHANNEL_DELETE') liveMemory.server.channelsDeleted++;
    if (type === 'ROLE_CREATE')    liveMemory.server.rolesCreated++;
    if (type === 'ROLE_DELETE')    liveMemory.server.rolesDeleted++;
    if (type === 'ROLE_ADD')     { liveMemory.roles.totalAdded++;   liveMemory.roles.lastRoleAction = detail; }
    if (type === 'ROLE_REMOVE')  { liveMemory.roles.totalRemoved++; liveMemory.roles.lastRoleAction = detail; }
    if (type === 'SERVER_NAME')    liveMemory.server.nameChanges++;
    if (type === 'SERVER_ICON')    liveMemory.server.iconChanged = true;
}

// ============================================================
// 📡 RADAR LOG
// ============================================================
async function sendDetailedLog(guild, title, details, color = '#3498db', radarType = 'EVENT', meta = {}) {
    if (!botSettings.radarEnabled) return;
    recordRadarEvent(radarType, details, meta);
    if (!botSettings.logEnabled) return;

    const logChannel = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
    if (!logChannel) return;

    setTimeout(async () => {
        const fetchedLogs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
        const logEntry    = fetchedLogs?.entries.first();
        const executor    = logEntry ? logEntry.executor.tag : 'System / Unknown';

        const logEmbed = new EmbedBuilder()
            .setTitle(`📡 RADAR: ${title}`)
            .setDescription(details)
            .addFields(
                { name: '👤 Executor:',  value: `**${executor}**`,    inline: true },
                { name: '📍 Location:', value: guild.name,             inline: true },
                { name: '🕐 Time:',     value: liveMemory.lastUpdated, inline: true }
            )
            .setColor(color)
            .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }, 2000);
}

// ============================================================
// 🤖 MISTRAL AI — مع دعم كل اللغات
// ============================================================
async function getMistralResponse(userMessage, guild, langHint = '') {
    if (!botSettings.aiEnabled) return null;

    const totalMembers  = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(m => m.presence?.status === 'online').size;

    const recentSummary = liveMemory.recentEvents.slice(0, 15)
        .map(e => `[${e.time}] ${e.type}: ${e.detail}`)
        .join('\n') || 'No recent events.';

    const systemPrompt = `You are "Pro Robot", the elite AI assistant of "Pro Server for MC".

=== LANGUAGE INSTRUCTION ===
${langHint || 'Detect the user language automatically and reply in the SAME language immediately. No exceptions.'}

=== LIVE SERVER MEMORY (Updated by Radar) ===
- Total Members: ${totalMembers} | Online: ${onlineMembers}
- Joins (session): ${liveMemory.members.totalJoins} | Last joined: ${liveMemory.members.lastJoined || 'N/A'}
- Leaves (session): ${liveMemory.members.totalLeaves} | Last left: ${liveMemory.members.lastLeft || 'N/A'}
- Bans (session): ${liveMemory.members.totalBans} | Last banned: ${liveMemory.members.lastBanned || 'N/A'}
- Channels Created: ${liveMemory.server.channelsCreated} | Deleted: ${liveMemory.server.channelsDeleted}
- Roles Created: ${liveMemory.server.rolesCreated} | Deleted: ${liveMemory.server.rolesDeleted}
- Role Assignments (session): +${liveMemory.roles.totalAdded} / -${liveMemory.roles.totalRemoved}
- Last Role Action: ${liveMemory.roles.lastRoleAction || 'N/A'}
- Server Name Changes: ${liveMemory.server.nameChanges}
- Memory Last Updated: ${liveMemory.lastUpdated || 'Not yet'}

=== LAST 15 RADAR EVENTS ===
${recentSummary}

=== EXTRA SERVER INFO (Owner Updates) ===
${extraServerInfo || 'No extra info yet.'}

=== RULES ===
- Owner: Saif (<@${CONFIG.OWNER_ID}>). Location: Egypt.
- If user asks to UPDATE/ADD/CHANGE any server info → reply EXACTLY with: UPDATE_REQUESTED
- Answer ALL questions using live memory above with full accuracy.
- Support ALL world languages — detect and reply instantly in the user's language.
- Be professional, helpful, and precise.`;

    try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MISTRAL_KEY}`
            },
            body: JSON.stringify({
                model: 'mistral-small',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: userMessage }
                ],
                temperature: 0.4
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || `I don't know, ask the owner! <@${CONFIG.OWNER_ID}>`;
    } catch (err) {
        return `I don't know, ask the owner! <@${CONFIG.OWNER_ID}>`;
    }
}

// ============================================================
// 📋 SLASH COMMANDS
// ============================================================
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Bot latency speed'),

    new SlashCommandBuilder().setName('clear').setDescription('Clear the chat')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),

    new SlashCommandBuilder().setName('send').setDescription('Send a custom message with specific time')
        .addStringOption(o  => o.setName('message').setDescription('Message content').setRequired(true))
        .addStringOption(o  => o.setName('style').setDescription('Message style').setRequired(true)
            .addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal', value: 'normal' }))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Wait before sending (minutes)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Auto-delete after (minutes)').setRequired(true))
        .addStringOption(o  => o.setName('color').setDescription('Box color')
            .addChoices({ name: 'Blue', value: '#3498db' }, { name: 'Red', value: '#e74c3c' }, { name: 'Green', value: '#2ecc71' })),

    new SlashCommandBuilder().setName('ads_set').setDescription('Setup a new auto-ad')
        .addStringOption(o  => o.setName('name').setDescription('Ad name').setRequired(true))
        .addStringOption(o  => o.setName('text').setDescription('Ad content').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Ad channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('Send every X minutes').setRequired(true))
        .addIntegerOption(o => o.setName('delete').setDescription('Delete after X minutes').setRequired(true))
        .addStringOption(o  => o.setName('style').setDescription('Style').setRequired(true)
            .addChoices({ name: 'Box', value: 'embed' }, { name: 'Normal', value: 'normal' })),

    new SlashCommandBuilder().setName('ads_edit').setDescription('Edit or delete an existing ad')
        .addStringOption(o  => o.setName('name').setDescription('Choose ad name').setRequired(true).setAutocomplete(true))
        .addStringOption(o  => o.setName('text').setDescription('New text (optional)'))
        .addChannelOption(o => o.setName('channel').setDescription('New channel (optional)').addChannelTypes(ChannelType.GuildText))
        .addIntegerOption(o => o.setName('interval').setDescription('New interval (optional)'))
        .addIntegerOption(o => o.setName('delete').setDescription('New delete time (optional)'))
        .addStringOption(o  => o.setName('style').setDescription('New style (optional)')
            .addChoices({ name: 'Box', value: 'embed' }, { name: 'Normal', value: 'normal' })),

    new SlashCommandBuilder().setName('translate').setDescription('Translate text')
        .addStringOption(o => o.setName('text').setDescription('The text').setRequired(true))
        .addStringOption(o => o.setName('to').setDescription('Language code (e.g: ar)').setRequired(true)),

    new SlashCommandBuilder().setName('vote').setDescription('Make a quick vote')
        .addStringOption(o => o.setName('question').setDescription('Vote question').setRequired(true)),

    new SlashCommandBuilder().setName('role').setDescription('Select a member and a rank')
        .addUserOption(o => o.setName('user').setDescription('The member').setRequired(true))
        .addRoleOption(o => o.setName('rank').setDescription('The rank').setRequired(true)),

    // ─── /spy — مراقبة شخص معين ───
    new SlashCommandBuilder().setName('spy').setDescription('Monitor full activity of a specific member')
        .addUserOption(o => o.setName('user').setDescription('The member to spy on').setRequired(true)),

    // ─── /protection — إعدادات الحماية ───
    new SlashCommandBuilder().setName('protection').setDescription('View and configure protection settings'),

    // ─── /control bot — لوحة تحكم كاملة للأونر ───
    new SlashCommandBuilder().setName('control').setDescription('⚙️ Owner Control Panel (Owner Only)')
        .addSubcommand(sub => sub.setName('bot').setDescription('Open the full bot control panel')),

].map(c => c.toJSON());

// ============================================================
// 🔄 AD LOOP
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
            sent = await chan.send(`**📢 ${ad.name}**\n\n${ad.text}`).catch(() => {};
        }
        if (sent) {
            ad.lastMsgId = sent.id;
            if (ad.deleteAfter > 0) setTimeout(() => sent.delete().catch(() => {}), ad.deleteAfter * 60000);
        }
    }, ad.interval * 60000);
}

// ============================================================
// 📡 RADAR EVENTS
// ============================================================
const BAD_WORDS = ['word1', 'word2', 'word3']; // أضف الكلمات السيئة هنا

client.on('guildUpdate', (oldGuild, newGuild) => {
    if (oldGuild.name !== newGuild.name)
        sendDetailedLog(newGuild, 'Server Name Changed', `From **${oldGuild.name}** → **${newGuild.name}**`, '#e67e22', 'SERVER_NAME');
    if (oldGuild.icon !== newGuild.icon)
        sendDetailedLog(newGuild, 'Server Icon Changed', 'Server avatar has been updated.', '#9b59b6', 'SERVER_ICON');
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
        const detail = `User: <@${newMember.id}> | Old: \`${oldMember.nickname || 'None'}\` → New: \`${newMember.nickname || 'Original'}\``;
        sendDetailedLog(newMember.guild, 'Nickname Changed', detail, '#3498db', 'NICKNAME_CHANGE',
            { user: newMember.user.tag, userId: newMember.id, userTag: newMember.user.tag });
    }
    const addedRoles   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (addedRoles.size > 0) {
        const detail = `Role **${addedRoles.first().name}** added to **${newMember.user.tag}**`;
        sendDetailedLog(newMember.guild, 'Role Added', detail, '#2ecc71', 'ROLE_ADD',
            { user: newMember.user.tag, userId: newMember.id, userTag: newMember.user.tag, role: addedRoles.first().name });
    }
    if (removedRoles.size > 0) {
        const detail = `Role **${removedRoles.first().name}** removed from **${newMember.user.tag}**`;
        sendDetailedLog(newMember.guild, 'Role Removed', detail, '#e74c3c', 'ROLE_REMOVE',
            { user: newMember.user.tag, userId: newMember.id, userTag: newMember.user.tag, role: removedRoles.first().name });
    }
});

client.on('channelCreate', ch =>
    sendDetailedLog(ch.guild, 'Channel Created', `Name: **${ch.name}**`, '#2ecc71', 'CHANNEL_CREATE', { channel: ch.name }));
client.on('channelDelete', ch =>
    sendDetailedLog(ch.guild, 'Channel Deleted', `Name: **${ch.name}**`, '#e74c3c', 'CHANNEL_DELETE', { channel: ch.name }));
client.on('roleCreate', role =>
    sendDetailedLog(role.guild, 'Role Created', `Role: **${role.name}**`, '#2ecc71', 'ROLE_CREATE', { role: role.name }));
client.on('roleDelete', role =>
    sendDetailedLog(role.guild, 'Role Deleted', `Role: **${role.name}**`, '#e74c3c', 'ROLE_DELETE', { role: role.name }));
client.on('guildBanAdd', ban =>
    sendDetailedLog(ban.guild, 'Member Banned', `User: **${ban.user.tag}** was banned.`, '#c0392b', 'MEMBER_BAN', { user: ban.user.tag, userId: ban.user.id, userTag: ban.user.tag }));

// ─── تسجيل رسائل الأعضاء في liveMemory (بدون إرسال log لكل رسالة) ───
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // سجّل النشاط دايماً
    recordRadarEvent('MESSAGE', `${message.author.tag} in #${message.channel.name}`, {
        userId:    message.author.id,
        userTag:   message.author.tag,
        channelId: message.channel.id,
    });

    if (!botSettings.autoModEnabled) {
        // لو الـ automod مطفي، روح للـ AI مباشرة
        return handleAIResponse(message);
    }

    // ─── Anti-Spam ───
    if (protectionConfig.antiSpam && !message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        if (checkSpam(message.author.id)) {
            await message.delete().catch(() => {});
            await message.member.timeout(60000, 'Spam').catch(() => {});
            const m = await message.channel.send(`⚠️ <@${message.author.id}> Spam detected! Muted for 1 minute.`);
            setTimeout(() => m.delete().catch(() => {}), 8000);
            sendDetailedLog(message.guild, '🛡️ Anti-Spam Triggered',
                `<@${message.author.id}> was muted for spamming in <#${message.channel.id}>.`, '#e74c3c', 'PROTECTION', { userId: message.author.id, userTag: message.author.tag });
            return;
        }
    }

    // ─── Anti-Links ───
    const linkRegex = /(https?:\/\/|discord\.gg\/|www\.)/i;
    if (protectionConfig.antiLinks && linkRegex.test(message.content)
        && !message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.delete().catch(() => {});
        const m = await message.channel.send(`🔗 <@${message.author.id}> Links are not allowed!`);
        setTimeout(() => m.delete().catch(() => {}), 8000);
        return;
    }

    // ─── Anti-Mass Mention ───
    if (protectionConfig.antiMassMention && message.mentions.users.size >= protectionConfig.mentionThreshold) {
        await message.delete().catch(() => {});
        await message.member.timeout(300000, 'Mass mention').catch(() => {});
        const m = await message.channel.send(`🚫 <@${message.author.id}> Mass mentions are not allowed! Muted 5 minutes.`);
        setTimeout(() => m.delete().catch(() => {}), 8000);
        sendDetailedLog(message.guild, '🛡️ Mass Mention Blocked',
            `<@${message.author.id}> tried to mass mention ${message.mentions.users.size} users.`, '#e74c3c', 'PROTECTION', { userId: message.author.id, userTag: message.author.tag });
        return;
    }

    // ─── Anti-Caps ───
    if (protectionConfig.antiCaps && checkCaps(message.content)
        && !message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.delete().catch(() => {});
        const m = await message.channel.send(`🔠 <@${message.author.id}> Please don't use excessive CAPS!`);
        setTimeout(() => m.delete().catch(() => {}), 6000);
        return;
    }

    // ─── Bad Words ───
    const hasBadWord = BAD_WORDS.some(word => message.content.toLowerCase().includes(word));
    if (hasBadWord) {
        await message.delete().catch(() => {});
        let count = (warnStorage.get(message.author.id) || 0) + 1;
        warnStorage.set(message.author.id, count);
        if (count === 1) {
            await message.member.timeout(5 * 60 * 1000, 'Swearing').catch(() => {});
            const m = await message.channel.send(`⚠️ <@${message.author.id}>, muted for 5 minutes.`);
            setTimeout(() => m.delete().catch(() => {}), 10000);
        } else {
            await message.member.ban({ reason: 'Repeated swearing' }).catch(() => {});
            message.channel.send(`🚫 <@${message.author.id}> permanently banned.`);
        }
        return;
    }

    handleAIResponse(message);
});

// ──────────────────────────────────────────────
// معالجة رد الـ AI
// ──────────────────────────────────────────────
async function handleAIResponse(message) {
    const isHelpChannel = message.channel.id === CONFIG.HELP_CH;
    const isMentioned   = message.mentions.users.has(client.user.id) && !message.mentions.everyone;

    if (!isHelpChannel && !isMentioned) return;

    try {
        await message.channel.sendTyping();
        const cleanContent = message.content
            .replace(`<@${client.user.id}>`, '')
            .replace(`<@!${client.user.id}>`, '')
            .trim();

        const langHint = detectLanguageHint(cleanContent || message.content);
        const text = await getMistralResponse(cleanContent || message.content, message.guild, langHint);
        if (!text) return;

        if (text.trim() === 'UPDATE_REQUESTED') {
            const verifyEmbed = new EmbedBuilder()
                .setTitle('🔐 Admin Verification Required')
                .setDescription('This action requires owner verification.\nClick the button below and enter the admin password to proceed.')
                .setColor('#e67e22')
                .setFooter({ text: 'Pro Robot Security System' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_verify_${message.author.id}_${Buffer.from(cleanContent).toString('base64').slice(0, 50)}`)
                    .setLabel('🔐 Enter Admin Password')
                    .setStyle(ButtonStyle.Danger)
            );

            const verifyMsg = await message.reply({ embeds: [verifyEmbed], components: [row] });
            if (isHelpChannel) setTimeout(() => verifyMsg.delete().catch(() => {}), 300000);
            return;
        }

        const botMsg = await message.reply(text);
        if (isHelpChannel) setTimeout(() => {
            message.delete().catch(() => {});
            botMsg.delete().catch(() => {});
        }, 300000);

        const rankKeywords = ['rank', 'role', 'رتبة', 'رتبه', 'رتب'];
        if (rankKeywords.some(key => message.content.toLowerCase().includes(key))) {
            const embed = new EmbedBuilder()
                .setDescription('Submit to write your username on Xbox to get the rank you want. By @pro_king510')
                .setColor('#3498db');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_rank_modal').setLabel('Submit').setStyle(ButtonStyle.Primary)
            );
            const sentModalMsg = await message.channel.send({ embeds: [embed], components: [row] });
            if (isHelpChannel) setTimeout(() => sentModalMsg.delete().catch(() => {}), 300000);
        }
    } catch (e) { console.error(e); }
}

// ============================================================
// ✅ READY
// ============================================================
client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (e) { console.error(e); }
    console.log(`✅ Logged in as ${client.user.tag}`);
    updateLiveInfo();
});

// ============================================================
// 🎛️ INTERACTION HANDLER
// ============================================================
client.on('interactionCreate', async (interaction) => {

    // ─── Admin Verify Button ───
    if (interaction.isButton() && interaction.customId.startsWith('admin_verify_')) {
        const parts    = interaction.customId.split('_');
        const authorId = parts[2];
        if (interaction.user.id !== authorId)
            return interaction.reply({ content: '❌ This button is not for you.', ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(interaction.customId.replace('admin_verify_', 'admin_modal_'))
            .setTitle('🔐 Admin Password Verification');
        const passwordInput = new TextInputBuilder()
            .setCustomId('admin_password_input').setLabel('Admin Password')
            .setStyle(TextInputStyle.Short).setPlaceholder('Enter the admin password here...').setRequired(true).setMinLength(4);
        modal.addComponents(new ActionRowBuilder().addComponents(passwordInput));
        return await interaction.showModal(modal);
    }

    // ─── Admin Modal Submit ───
    if (interaction.isModalSubmit() && interaction.customId.startsWith('admin_modal_')) {
        const enteredPassword = interaction.fields.getTextInputValue('admin_password_input');
        const encodedRequest  = interaction.customId.split('_').slice(3).join('_');
        let   originalRequest = '';
        try { originalRequest = Buffer.from(encodedRequest, 'base64').toString('utf8'); } catch {}

        if (enteredPassword === ADMIN_PASSWORD) {
            extraServerInfo = originalRequest || 'Updated by owner.';
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ Verification Successful')
                    .setDescription(`**Update applied:**\n> ${extraServerInfo}`)
                    .setColor('#2ecc71')
                    .setFooter({ text: 'Pro Robot — Info board will update now.' })],
                ephemeral: true
            });
            updateLiveInfo(interaction.guild);
        } else {
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ Incorrect Password')
                    .setDescription('Wrong password. Action has been cancelled for security.')
                    .setColor('#e74c3c')],
                ephemeral: true
            });
        }
        return;
    }

    // ─── Rank Modal Button ───
    if (interaction.isButton() && interaction.customId === 'open_rank_modal') {
        const modal = new ModalBuilder().setCustomId('rank_modal').setTitle('Rank Request');
        const userField = new TextInputBuilder().setCustomId('xbox_user').setLabel('Username').setStyle(TextInputStyle.Short).setPlaceholder('Write your Xbox username').setRequired(true);
        const rankField = new TextInputBuilder().setCustomId('rank_type').setLabel('Rank you want').setStyle(TextInputStyle.Short).setPlaceholder('Write the rank name').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(userField), new ActionRowBuilder().addComponents(rankField));
        return await interaction.showModal(modal);
    }

    // ─── Rank Modal Submit ───
    if (interaction.isModalSubmit() && interaction.customId === 'rank_modal') {
        const xbox  = interaction.fields.getTextInputValue('xbox_user');
        const rank  = interaction.fields.getTextInputValue('rank_type');
        const logCh = client.channels.cache.get(CONFIG.SUBMIT_LOG);
        if (logCh) await logCh.send(`🔔 New Rank Request from <@${interaction.user.id}>:\n**Username:** ${xbox}\n**Rank:** ${rank}`);
        return await interaction.reply({ content: '✅ Your request has been submitted to the owner!', ephemeral: true });
    }

    // ─── Vote Buttons ───
    if (interaction.isButton() && (interaction.customId === 'v_yes' || interaction.customId === 'v_no')) {
        const label = interaction.customId === 'v_yes' ? '✅ Yes' : '❌ No';
        return await interaction.reply({ content: `You voted: **${label}**`, ephemeral: true });
    }

    // ─── Stop Ad Button ───
    if (interaction.isButton() && interaction.customId.startsWith('stop_ad_')) {
        const name = interaction.customId.replace('stop_ad_', '');
        const ad   = adsStorage.get(name);
        if (ad) {
            if (ad.timer) clearInterval(ad.timer);
            adsStorage.delete(name);
            return await interaction.update({ content: `🗑️ Ad **${name}** removed.`, components: [], ephemeral: true });
        }
    }

    // ─── Control Panel Buttons ───
    if (interaction.isButton() && interaction.customId.startsWith('ctrl_')) {
        if (interaction.user.id !== CONFIG.OWNER_ID)
            return interaction.reply({ content: '❌ Owner only!', ephemeral: true });

        const action = interaction.customId.replace('ctrl_', '');

        const toggleMap = {
            'toggle_ai':       () => { botSettings.aiEnabled      = !botSettings.aiEnabled;      return `🤖 AI: ${botSettings.aiEnabled ? '✅ ON' : '❌ OFF'}`; },
            'toggle_automod':  () => { botSettings.autoModEnabled = !botSettings.autoModEnabled; return `🛡️ AutoMod: ${botSettings.autoModEnabled ? '✅ ON' : '❌ OFF'}`; },
            'toggle_welcome':  () => { botSettings.welcomeEnabled = !botSettings.welcomeEnabled; return `👋 Welcome: ${botSettings.welcomeEnabled ? '✅ ON' : '❌ OFF'}`; },
            'toggle_radar':    () => { botSettings.radarEnabled   = !botSettings.radarEnabled;   return `📡 Radar: ${botSettings.radarEnabled ? '✅ ON' : '❌ OFF'}`; },
            'toggle_logs':     () => { botSettings.logEnabled     = !botSettings.logEnabled;     return `📋 Logs: ${botSettings.logEnabled ? '✅ ON' : '❌ OFF'}`; },
            'toggle_spam':     () => { protectionConfig.antiSpam   = !protectionConfig.antiSpam;   return `🚫 Anti-Spam: ${protectionConfig.antiSpam ? '✅ ON' : '❌ OFF'}`; },
            'toggle_links':    () => { protectionConfig.antiLinks   = !protectionConfig.antiLinks;  return `🔗 Anti-Links: ${protectionConfig.antiLinks ? '✅ ON' : '❌ OFF'}`; },
            'toggle_caps':     () => { protectionConfig.antiCaps    = !protectionConfig.antiCaps;   return `🔠 Anti-Caps: ${protectionConfig.antiCaps ? '✅ ON' : '❌ OFF'}`; },
            'toggle_mention':  () => { protectionConfig.antiMassMention = !protectionConfig.antiMassMention; return `📢 Anti-MassMention: ${protectionConfig.antiMassMention ? '✅ ON' : '❌ OFF'}`; },
            'toggle_raid':     () => { protectionConfig.antiRaid    = !protectionConfig.antiRaid;   return `⚔️ Anti-Raid: ${protectionConfig.antiRaid ? '✅ ON' : '❌ OFF'}`; },
            'clear_memory':    () => { liveMemory.recentEvents = []; liveMemory.userActivity.clear(); return '🧹 Live memory cleared!'; },
        };

        if (toggleMap[action]) {
            const result = toggleMap[action]();
            await interaction.reply({ content: result, ephemeral: true });
            // تحديث لوحة التحكم
            await refreshControlPanel(interaction.message, interaction.guild);
        } else if (action === 'open_badwords_modal') {
            const modal = new ModalBuilder().setCustomId('ctrl_badwords_modal').setTitle('⚙️ Update Bad Words');
            const field = new TextInputBuilder().setCustomId('badwords_input')
                .setLabel('Bad words (comma separated)')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(BAD_WORDS.join(', '))
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(field));
            return await interaction.showModal(modal);
        } else if (action === 'send_announcement') {
            const modal = new ModalBuilder().setCustomId('ctrl_announce_modal').setTitle('📢 Send Announcement');
            const field = new TextInputBuilder().setCustomId('announce_text')
                .setLabel('Announcement content').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(field));
            return await interaction.showModal(modal);
        } else if (action === 'update_info') {
            const modal = new ModalBuilder().setCustomId('ctrl_info_modal').setTitle('📝 Update Server Info');
            const field = new TextInputBuilder().setCustomId('info_text')
                .setLabel('New server info').setStyle(TextInputStyle.Paragraph)
                .setValue(extraServerInfo || '').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(field));
            return await interaction.showModal(modal);
        }
        return;
    }

    // ─── Control Panel Modals ───
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'ctrl_badwords_modal') {
            const input = interaction.fields.getTextInputValue('badwords_input');
            BAD_WORDS.length = 0;
            BAD_WORDS.push(...input.split(',').map(w => w.trim().toLowerCase()).filter(Boolean));
            return await interaction.reply({ content: `✅ Bad words updated! (${BAD_WORDS.length} words)`, ephemeral: true });
        }
        if (interaction.customId === 'ctrl_announce_modal') {
            const text   = interaction.fields.getTextInputValue('announce_text');
            const guild  = interaction.guild;
            const logCh  = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
            if (logCh) await logCh.send({ embeds: [new EmbedBuilder().setTitle('📢 Announcement from Owner').setDescription(text).setColor('#f39c12').setTimestamp()] });
            return await interaction.reply({ content: '✅ Announcement sent!', ephemeral: true });
        }
        if (interaction.customId === 'ctrl_info_modal') {
            extraServerInfo = interaction.fields.getTextInputValue('info_text');
            updateLiveInfo(interaction.guild);
            return await interaction.reply({ content: '✅ Server info updated!', ephemeral: true });
        }
    }

    // ─── Autocomplete ───
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const choices      = Array.from(adsStorage.keys());
        const filtered     = choices.filter(c => c.startsWith(focusedValue));
        await interaction.respond(filtered.map(c => ({ name: c, value: c }))).catch(() => {});
    }

    // ─── Slash Commands ───
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, channel } = interaction;

        try {

            // ──── /ping ────
            if (commandName === 'ping')
                return await interaction.reply(`🏓 Pong! Speed: \`${client.ws.ping}ms\``);

            // ──── /role ────
            if (commandName === 'role') {
                const targetUser = options.getMember('user');
                const targetRole = options.getRole('rank');
                const roleChan   = guild.channels.cache.get(CONFIG.ROLE_CHANNEL);
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
                    return await interaction.reply({ content: '❌ No permission!', ephemeral: true });
                await targetUser.roles.add(targetRole).catch(e => console.error(e));
                const roleEmbed = new EmbedBuilder()
                    .setTitle('✨ New Rank Given')
                    .setDescription(`**Member:** <@${targetUser.id}>\n**Rank:** <@&${targetRole.id}>\n**By:** <@${interaction.user.id}>`)
                    .setColor('#3498db').setTimestamp();
                if (roleChan) await roleChan.send({ embeds: [roleEmbed] });
                return await interaction.reply({ content: `✅ **${targetRole.name}** given to **${targetUser.user.username}**.`, ephemeral: true });
            }

            // ──── /send ────
            if (commandName === 'send') {
                const msg      = options.getString('message');
                const style    = options.getString('style');
                const delay    = options.getInteger('delay_send');
                const delAfter = options.getInteger('delete_after');
                const color    = options.getString('color') || '#3498db';
                await interaction.reply({ content: `✅ Message will be sent in ${delay} minute(s).`, ephemeral: true });
                setTimeout(async () => {
                    let sent;
                    if (style === 'embed') sent = await channel.send({ embeds: [new EmbedBuilder().setDescription(msg).setColor(color)] }).catch(() => {});
                    else sent = await channel.send(msg).catch(() => {});
                    if (sent && delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
                }, delay * 60000);
                return;
            }

            // ──── /ads_set ────
            if (commandName === 'ads_set') {
                const name = options.getString('name');
                const data = {
                    name, text: options.getString('text'), channelId: options.getChannel('channel').id,
                    interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'),
                    style: options.getString('style'), timer: null, lastMsgId: null
                };
                adsStorage.set(name, data);
                startAdLoop(name, guild.id);
                return await interaction.reply({ content: `✅ Ad activated: **${name}**`, ephemeral: true });
            }

            // ──── /ads_edit ────
            if (commandName === 'ads_edit') {
                const name = options.getString('name');
                const ad   = adsStorage.get(name);
                if (!ad) return await interaction.reply({ content: '❌ Not found.', ephemeral: true });
                if (options.getString('text'))             ad.text      = options.getString('text');
                if (options.getChannel('channel'))         ad.channelId = options.getChannel('channel').id;
                if (options.getInteger('interval'))        ad.interval  = options.getInteger('interval');
                if (options.getInteger('delete') !== null) ad.deleteAfter = options.getInteger('delete');
                if (options.getString('style'))            ad.style     = options.getString('style');
                startAdLoop(name, guild.id);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`stop_ad_${name}`).setLabel('Delete ad 🗑️').setStyle(ButtonStyle.Danger)
                );
                return await interaction.reply({ content: `⚙️ Ad **${name}** updated.`, components: [row], ephemeral: true });
            }

            // ──── /clear ────
            if (commandName === 'clear') {
                await interaction.deferReply({ ephemeral: true });
                await channel.bulkDelete(Math.min(options.getInteger('amount'), 100)).catch(() => {});
                return await interaction.editReply('Chat cleaned! 🧹');
            }

            // ──── /translate ────
            if (commandName === 'translate') {
                await interaction.deferReply();
                const res  = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${options.getString('to').toLowerCase()}&dt=t&q=${encodeURI(options.getString('text'))}`);
                const json = await res.json();
                return await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🌐 Translation').setDescription(json[0].map(i => i[0]).join('')).setColor('#4285F4')] });
            }

            // ──── /vote ────
            if (commandName === 'vote') {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger)
                );
                return await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 New Vote').setDescription(options.getString('question')).setColor('#f1c40f')], components: [row] });
            }

            // ──── /spy ────
            if (commandName === 'spy') {
                if (interaction.user.id !== CONFIG.OWNER_ID && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
                    return await interaction.reply({ content: '❌ No permission!', ephemeral: true });

                const target   = options.getUser('user');
                const activity = liveMemory.userActivity.get(target.id);

                if (!activity) {
                    return await interaction.reply({
                        embeds: [new EmbedBuilder()
                            .setTitle(`🔍 Spy: ${target.tag}`)
                            .setDescription('No activity recorded for this user yet in this session.')
                            .setColor('#95a5a6')],
                        ephemeral: true
                    });
                }

                const channelList = [...activity.channels]
                    .map(id => `<#${id}>`)
                    .join(', ') || 'None';

                const actionList = activity.actions.slice(0, 10)
                    .map(a => `• \`[${a.time}]\` **${a.type}**: ${a.detail}`)
                    .join('\n') || 'No actions recorded.';

                return await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`🕵️ SPY REPORT — ${target.tag}`)
                        .setThumbnail(target.displayAvatarURL())
                        .addFields(
                            { name: '📍 Active Channels', value: channelList,  inline: false },
                            { name: '📋 Recent Actions (last 10)', value: actionList, inline: false },
                            { name: '🕐 Last Seen', value: activity.lastSeen || 'Unknown', inline: true }
                        )
                        .setColor('#8e44ad')
                        .setFooter({ text: 'Pro Robot — Live Spy System' })
                        .setTimestamp()],
                    ephemeral: true
                });
            }

            // ──── /protection ────
            if (commandName === 'protection') {
                const statusEmbed = new EmbedBuilder()
                    .setTitle('🛡️ Protection System Status')
                    .setDescription(
                        `**Anti-Spam:** ${protectionConfig.antiSpam ? '✅' : '❌'}\n` +
                        `**Anti-Raid:** ${protectionConfig.antiRaid ? '✅' : '❌'}\n` +
                        `**Anti-Links:** ${protectionConfig.antiLinks ? '✅' : '❌'}\n` +
                        `**Anti-Mass Mention:** ${protectionConfig.antiMassMention ? '✅' : '❌'}\n` +
                        `**Anti-Caps:** ${protectionConfig.antiCaps ? '✅' : '❌'}\n\n` +
                        `**Spam Threshold:** ${protectionConfig.spamThreshold} msgs / 5s\n` +
                        `**Raid Threshold:** ${protectionConfig.raidThreshold} joins / 10s\n` +
                        `**Mention Limit:** ${protectionConfig.mentionThreshold} mentions / message\n` +
                        `**Caps Limit:** ${protectionConfig.capsPercent}%`
                    )
                    .setColor('#27ae60')
                    .setFooter({ text: 'Pro Robot — Security System' });
                return await interaction.reply({ embeds: [statusEmbed] });
            }

            // ──── /control bot ────
            if (commandName === 'control' && options.getSubcommand() === 'bot') {
                if (interaction.user.id !== CONFIG.OWNER_ID)
                    return await interaction.reply({ content: '❌ This command is **Owner Only!**', ephemeral: true });

                await interaction.deferReply({ ephemeral: true });
                const panelEmbed = buildControlPanelEmbed(guild);
                const rows       = buildControlPanelRows();
                await interaction.editReply({ embeds: [panelEmbed], components: rows });
                return;
            }

        } catch (e) { console.error(e); }
    }
});

// ============================================================
// ⚙️ CONTROL PANEL BUILDER
// ============================================================
function buildControlPanelEmbed(guild) {
    return new EmbedBuilder()
        .setTitle('⚙️ Pro Robot — Owner Control Panel')
        .setDescription(
            `**Server:** ${guild?.name || 'Unknown'}\n` +
            `**Members:** ${guild?.memberCount || '?'}\n\n` +
            `━━━━━━ 🤖 Bot Systems ━━━━━━\n` +
            `🤖 AI Responses:   ${botSettings.aiEnabled      ? '✅ ON' : '❌ OFF'}\n` +
            `🛡️ Auto Moderation: ${botSettings.autoModEnabled ? '✅ ON' : '❌ OFF'}\n` +
            `👋 Welcome System: ${botSettings.welcomeEnabled ? '✅ ON' : '❌ OFF'}\n` +
            `📡 Radar System:   ${botSettings.radarEnabled   ? '✅ ON' : '❌ OFF'}\n` +
            `📋 Logging:        ${botSettings.logEnabled     ? '✅ ON' : '❌ OFF'}\n\n` +
            `━━━━━━ 🛡️ Protection ━━━━━━\n` +
            `🚫 Anti-Spam:      ${protectionConfig.antiSpam        ? '✅' : '❌'}\n` +
            `🔗 Anti-Links:     ${protectionConfig.antiLinks       ? '✅' : '❌'}\n` +
            `🔠 Anti-Caps:      ${protectionConfig.antiCaps        ? '✅' : '❌'}\n` +
            `📢 Anti-Mention:   ${protectionConfig.antiMassMention ? '✅' : '❌'}\n` +
            `⚔️ Anti-Raid:      ${protectionConfig.antiRaid        ? '✅' : '❌'}\n\n` +
            `━━━━━━ 📊 Live Stats ━━━━━━\n` +
            `• Joins: ${liveMemory.members.totalJoins} | Leaves: ${liveMemory.members.totalLeaves} | Bans: ${liveMemory.members.totalBans}\n` +
            `• Active Users Tracked: ${liveMemory.userActivity.size}\n` +
            `• Events Logged: ${liveMemory.recentEvents.length}\n` +
            `• Last Update: ${liveMemory.lastUpdated || 'N/A'}`
        )
        .setColor('#2c3e50')
        .setFooter({ text: 'Pro Robot — Owner Panel • Changes apply instantly' })
        .setTimestamp();
}

function buildControlPanelRows() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ctrl_toggle_ai')      .setLabel('🤖 AI')        .setStyle(botSettings.aiEnabled      ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ctrl_toggle_automod') .setLabel('🛡️ AutoMod')   .setStyle(botSettings.autoModEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ctrl_toggle_welcome') .setLabel('👋 Welcome')   .setStyle(botSettings.welcomeEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ctrl_toggle_radar')   .setLabel('📡 Radar')     .setStyle(botSettings.radarEnabled   ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ctrl_toggle_logs')    .setLabel('📋 Logs')      .setStyle(botSettings.logEnabled     ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ctrl_toggle_spam')    .setLabel('🚫 Anti-Spam') .setStyle(protectionConfig.antiSpam        ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ctrl_toggle_links')   .setLabel('🔗 Anti-Link') .setStyle(protectionConfig.antiLinks       ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ctrl_toggle_caps')    .setLabel('🔠 Anti-Caps') .setStyle(protectionConfig.antiCaps        ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ctrl_toggle_mention') .setLabel('📢 Mention')   .setStyle(protectionConfig.antiMassMention ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ctrl_toggle_raid')    .setLabel('⚔️ Anti-Raid') .setStyle(protectionConfig.antiRaid        ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ctrl_open_badwords_modal').setLabel('🤬 Bad Words').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ctrl_send_announcement')  .setLabel('📢 Announce') .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ctrl_update_info')        .setLabel('📝 Update Info').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ctrl_clear_memory')       .setLabel('🧹 Clear Memory').setStyle(ButtonStyle.Danger),
    );
    return [row1, row2, row3];
}

async function refreshControlPanel(message, guild) {
    try {
        await message.edit({
            embeds:     [buildControlPanelEmbed(guild)],
            components: buildControlPanelRows()
        });
    } catch {}
}

// ============================================================
// 👋 WELCOME
// ============================================================
client.on('guildMemberAdd', async (member) => {
    sendDetailedLog(member.guild, 'New Member Joined', `<@${member.id}> joined the server.`, '#2ecc71', 'MEMBER_JOIN', { user: member.user.tag, userId: member.id, userTag: member.user.tag });

    // Anti-Raid Check
    if (protectionConfig.antiRaid && checkRaid()) {
        if (!raidLockdown) {
            raidLockdown = true;
            const logCh = member.guild.channels.cache.get(CONFIG.SUBMIT_LOG);
            if (logCh) await logCh.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🚨 RAID DETECTED — Lockdown Active')
                    .setDescription(`More than **${protectionConfig.raidThreshold}** members joined in 10 seconds!\nNew joins will be auto-kicked for 2 minutes.`)
                    .setColor('#ff0000')]
            });
            setTimeout(() => { raidLockdown = false; }, 120000);
        }
        await member.kick('Anti-Raid: Server under attack').catch(() => {});
        return;
    }

    if (!botSettings.welcomeEnabled) return;
    await member.roles.add([CONFIG.AUTO_ROLE, CONFIG.AUTO_ROLE_2]).catch(e => console.error(e));
    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeEmbed = new EmbedBuilder()
            .setDescription(
                `𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n` +
                `- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n` +
                `- Chat with us and go to read rules server.\n[]--------------------!--------------------[]\n` +
                `→ <#1482874761951576228> | <#1482901664951304222>\n[¡}================{!}================[¡]\nThank you! ❤️`
            )
            .setColor('#3498db');
        const m = await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] }).catch(() => {});
        if (m) setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

// ============================================================
// 🚪 LEAVE
// ============================================================
client.on('guildMemberRemove', async (member) => {
    sendDetailedLog(member.guild, 'Member Left', `**${member.user.tag}** left.`, '#e74c3c', 'MEMBER_LEAVE', { user: member.user.tag, userId: member.id, userTag: member.user.tag });
    const channels = member.guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
    for (const [id, channel] of channels) {
        try {
            const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
            if (!messages) continue;
            const memberMessages = messages.filter(m => m.author.id === member.id);
            if (memberMessages.size > 0)
                await channel.bulkDelete(memberMessages).catch(() => {
                    memberMessages.forEach(m => m.delete().catch(() => {}));
                });
        } catch (e) { console.error(e); }
    }
    updateLiveInfo(member.guild);
});

// ============================================================
// 📊 LIVE INFO
// ============================================================
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;

    const infoEmbed = new EmbedBuilder()
        .setTitle('📊 Pro Server Live Status')
        .setDescription(
            `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\n` +
            `Information about server:-\n` +
            `• Owner: <@${CONFIG.OWNER_ID}>\n` +
            `• Robot: <@${CONFIG.BOT_ID}>\n` +
            `• Server from: Egypt\n` +
            `• Date Server: 15/03/2026\n` +
            `• Total Members: ${guild.memberCount}\n` +
            `• Joins (session): ${liveMemory.members.totalJoins} | Leaves: ${liveMemory.members.totalLeaves} | Bans: ${liveMemory.members.totalBans}\n` +
            `• **Latest Owner Update:** ${extraServerInfo || 'No recent updates.'}\n` +
            `• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n` +
            `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`
        )
        .setColor('#3498db')
        .setFooter({ text: `Last Radar Update: ${liveMemory.lastUpdated || 'Now'}` })
        .setTimestamp();

    try {
        const msgs = await infoCh.messages.fetch({ limit: 10 }).catch(() => null);
        if (msgs) msgs.filter(m => m.author.id === client.user.id).forEach(async m => await m.delete().catch(() => {}));
        await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
    } catch (e) { console.error(e); }
}

client.login(process.env.TOKEN);

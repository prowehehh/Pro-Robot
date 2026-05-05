const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle, AuditLogEvent,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

// Server keep-alive
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
    ],
});

// Server Configuration
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
const pendingUpdates = new Map(); 
const ADMIN_PASSWORD = "Pro@Robot510";
let   extraServerInfo = ""; 

// ⚙️ Bot Settings (Toggleable via Control Panel)
const botSettings = {
    aiEnabled:       true,
    welcomeEnabled:  true,
    autoModEnabled:  true,
    radarEnabled:    true,
    protectionLevel: 'High'
};

// 🛡️ Protection Config
const protectionConfig = {
    antiSpam: true,
    antiLink: true,
    antiRaid: true,
    raidThreshold: 5, // أعضاء في 10 ثواني
};

// 🧠 Live Server Memory (The Spy Core)
const liveMemory = {
    recentEvents: [],
    userActivity: new Map(), // userId -> {actions: [], lastSeen: time}
    lastUpdated: null
};

function recordActivity(userId, userTag, action, detail) {
    const entry = { action, detail, time: new Date().toLocaleString('en-EG') };
    if (!liveMemory.userActivity.has(userId)) {
        liveMemory.userActivity.set(userId, { tag: userTag, actions: [] });
    }
    const userData = liveMemory.userActivity.get(userId);
    userData.actions.unshift(entry);
    if (userData.actions.length > 20) userData.actions.pop();
    
    liveMemory.recentEvents.unshift({ user: userTag, ...entry });
    if (liveMemory.recentEvents.length > 30) liveMemory.recentEvents.pop();
    liveMemory.lastUpdated = entry.time;
}

// --- Audit Log Monitoring System (Radar Pro) ---
async function sendDetailedLog(guild, title, details, color = '#3498db', type = 'EVENT') {
    if (!botSettings.radarEnabled) return;
    
    const logChannel = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
    if (!logChannel) return;

    setTimeout(async () => {
        const fetchedLogs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
        const logEntry = fetchedLogs?.entries.first();
        const executor = logEntry ? logEntry.executor.tag : "System";

        recordActivity(logEntry?.executor.id || 'System', executor, title, details);

        const logEmbed = new EmbedBuilder()
            .setTitle(`📡 RADAR: ${title}`)
            .setDescription(details)
            .addFields(
                { name: '👤 Executor:', value: `**${executor}**`, inline: true },
                { name: '📍 Location:', value: guild.name, inline: true }
            )
            .setColor(color)
            .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }, 2000);
}

const BAD_WORDS = ['word1', 'word2', 'word3']; 

// 🌐 Language Detector & AI Response
async function getMistralResponse(userMessage, guild) {
    if (!botSettings.aiEnabled) return "⚠️ AI system is currently disabled by the owner.";

    // Detect language simply (Arabic vs Other)
    const isArabic = /[\u0600-\u06FF]/.test(userMessage);
    const langInstruction = isArabic ? "Respond in Egyptian Arabic dialect." : "Detect the user language and respond in the SAME language perfectly.";

    try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MISTRAL_KEY}`
            },
            body: JSON.stringify({
                model: "mistral-small",
                messages: [
                    { role: "system", content: `You are "Pro Robot", the elite AI owner of "Pro Server for MC".
                    - Owner: Saif (<@${CONFIG.OWNER_ID}>).
                    - Current Location: Egypt.
                    - Memory: Last server activity was "${liveMemory.recentEvents[0]?.detail || 'Quiet'}".
                    - Instruction: ${langInstruction}
                    - If asked to update server info, say: "To process this update, please provide the admin password to verify you are the owner."` },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.5
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "I'm processing...";
    } catch (err) {
        return "System error, contact Saif.";
    }
}

// --- Command Registration ---
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Bot latency speed'),
    new SlashCommandBuilder().setName('clear').setDescription('Clear the chat').addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
    new SlashCommandBuilder().setName('control').setDescription('⚙️ Control Panel (Owner Only)')
        .addSubcommand(sub => sub.setName('bot').setDescription('Open the management panel')),
    new SlashCommandBuilder().setName('spy').setDescription('View activity of a user (Owner Only)')
        .addUserOption(o => o.setName('target').setDescription('User to check').setRequired(true)),
    new SlashCommandBuilder().setName('send').setDescription('Send a custom message').addStringOption(o => o.setName('message').setDescription('Content').setRequired(true)).addStringOption(o => o.setName('style').setDescription('Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})).addIntegerOption(o => o.setName('delay_send').setDescription('Delay (m)').setRequired(true)).addIntegerOption(o => o.setName('delete_after').setDescription('Delete (m)').setRequired(true)),
    new SlashCommandBuilder().setName('ads_set').setDescription('Setup ad').addStringOption(o => o.setName('name').setDescription('Name').setRequired(true)).addStringOption(o => o.setName('text').setDescription('Content').setRequired(true)).addChannelOption(o => o.setName('channel').addChannelTypes(ChannelType.GuildText).setRequired(true)).addIntegerOption(o => o.setName('interval').setRequired(true)).addIntegerOption(o => o.setName('delete').setRequired(true)).addStringOption(o => o.setName('style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),
    new SlashCommandBuilder().setName('ads_edit').setDescription('Edit ad').addStringOption(o => o.setName('name').setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName('translate').setDescription('Translate').addStringOption(o => o.setName('text').setRequired(true)).addStringOption(o => o.setName('to').setRequired(true)),
    new SlashCommandBuilder().setName('vote').setDescription('Vote').addStringOption(o => o.setName('question').setRequired(true)),
    new SlashCommandBuilder().setName('role').setDescription('Give role').addUserOption(o => o.setName('user').setRequired(true)).addRoleOption(o => o.setName('rank').setRequired(true)),
].map(c => c.toJSON());

// Ad Loop Helper
function startAdLoop(adName, guildId) {
    const ad = adsStorage.get(adName);
    if (!ad) return;
    if (ad.timer) clearInterval(ad.timer);
    ad.timer = setInterval(async () => {
        const guild = client.guilds.cache.get(guildId);
        const chan = guild?.channels.cache.get(ad.channelId);
        if (!chan) return;
        if (ad.lastMsgId) {
            const old = await chan.messages.fetch(ad.lastMsgId).catch(() => null);
            if (old) await old.delete().catch(() => {});
        }
        let sent;
        if (ad.style === 'embed') { sent = await chan.send({ embeds: [new EmbedBuilder().setDescription(ad.text).setColor('#3498db').setTitle(`📢 ${ad.name}`)] }).catch(() => {}); }
        else { sent = await chan.send(`**📢 ${ad.name}**\n\n${ad.text}`).catch(() => {}); }
        if (sent) { ad.lastMsgId = sent.id; if (ad.deleteAfter > 0) setTimeout(() => sent.delete().catch(() => {}), ad.deleteAfter * 60000); }
    }, ad.interval * 60000);
}

// --- Events ---
client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
    console.log(`✅ Logged in as ${client.user.tag}`);
    updateLiveInfo();
});

// 🛡️ Anti-Spam Logic
const userMessages = new Map();
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Record Spy Data
    recordActivity(message.author.id, message.author.tag, 'SENT_MESSAGE', `In #${message.channel.name}: ${message.content.slice(0, 50)}`);

    // Anti-Link
    if (botSettings.protectionLevel === 'High' && /(https?:\/\/|discord\.gg)/g.test(message.content) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.delete();
        return message.channel.send(`❌ <@${message.author.id}>, Links are forbidden!`).then(m => setTimeout(() => m.delete(), 5000));
    }

    // Password Handler
    if (pendingUpdates.has(message.author.id)) {
        if (message.content === ADMIN_PASSWORD) {
            extraServerInfo = pendingUpdates.get(message.author.id);
            pendingUpdates.delete(message.author.id);
            await message.reply("✅ **Password Correct!** Info updated.");
            return updateLiveInfo(message.guild);
        } else {
            pendingUpdates.delete(message.author.id);
            return await message.reply("❌ **Incorrect.** Canceled.");
        }
    }

    // AI Handling
    const isHelpChannel = message.channel.id === CONFIG.HELP_CH;
    const isMentioned = message.mentions.users.has(client.user.id);
    if (isHelpChannel || isMentioned) {
        await message.channel.sendTyping();
        const text = await getMistralResponse(message.content, message.guild);
        if (text.includes("password")) pendingUpdates.set(message.author.id, message.content);
        message.reply(text);
    }
});

// ⚙️ Interaction Handler (Control Panel & Buttons)
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild } = interaction;

        if (commandName === 'control' && interaction.user.id === CONFIG.OWNER_ID) {
            const embed = new EmbedBuilder()
                .setTitle("⚙️ Pro Robot Control Panel")
                .setDescription("Manage your robot systems in real-time.")
                .addFields(
                    { name: "🤖 AI System", value: botSettings.aiEnabled ? "✅ ON" : "❌ OFF", inline: true },
                    { name: "📡 Radar", value: botSettings.radarEnabled ? "✅ ON" : "❌ OFF", inline: true },
                    { name: "🛡️ Protection", value: botSettings.protectionLevel, inline: true }
                ).setColor('#2c3e50');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('toggle_ai').setLabel('Toggle AI').setStyle(botSettings.aiEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('toggle_radar').setLabel('Toggle Radar').setStyle(botSettings.radarEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary)
            );
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (commandName === 'spy' && interaction.user.id === CONFIG.OWNER_ID) {
            const target = options.getUser('target');
            const data = liveMemory.userActivity.get(target.id);
            if (!data) return interaction.reply({ content: "No data found for this user.", ephemeral: true });

            const spyEmbed = new EmbedBuilder()
                .setTitle(`🕵️ Spy Report: ${target.tag}`)
                .setDescription(data.actions.map(a => `\`[${a.time}]\` **${a.action}**: ${a.detail}`).join('\n').slice(0, 2000))
                .setColor('#e74c3c');
            return interaction.reply({ embeds: [spyEmbed], ephemeral: true });
        }
    }

    // Toggle Buttons Handling
    if (interaction.isButton() && interaction.user.id === CONFIG.OWNER_ID) {
        if (interaction.customId === 'toggle_ai') botSettings.aiEnabled = !botSettings.aiEnabled;
        if (interaction.customId === 'toggle_radar') botSettings.radarEnabled = !botSettings.radarEnabled;
        await interaction.update({ content: "✅ Settings Updated!", embeds: [], components: [] });
    }
});

// Welcome & Radar Tracking
client.on('guildMemberAdd', async (member) => {
    recordActivity(member.id, member.user.tag, 'JOINED_SERVER', `New member added to the ranks.`);
    if (botSettings.welcomeEnabled) {
        const roles = [CONFIG.AUTO_ROLE, CONFIG.AUTO_ROLE_2];
        await member.roles.add(roles).catch(() => {});
        updateLiveInfo(member.guild);
    }
});

// Live Info System
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;
    
    const infoEmbed = new EmbedBuilder()
        .setTitle("📊 Pro Server Live Status")
        .setDescription(`[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\n**Live Monitoring Active**\n• Owner: <@${CONFIG.OWNER_ID}>\n• Total Members: ${guild.memberCount}\n• Latest Update: ${extraServerInfo || "Everything is normal."}\n• Server Time: ${new Date().toLocaleTimeString('en-EG')}\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`)
        .setColor('#3498db').setTimestamp();

    const msgs = await infoCh.messages.fetch({ limit: 5 }).catch(() => null);
    if (msgs) msgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));
    await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
}

client.login(process.env.TOKEN);

const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle, AuditLogEvent 
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
    ],
});

// Server Configuration
const CONFIG = {
    WELCOME_CH: '1482881348204101768',
    AUTO_ROLE: '1482883802186514615',
    AUTO_ROLE_2: '1499510435639197887',
    OWNER_ID: '1134146616857731173',
    BOT_ID: '1495419259147386920',
    HELP_CH: '1497909981725593712',
    SUBMIT_LOG: '1494367980702797935',
    ROLE_CHANNEL: '1482874761951576228',
    INFO_CH: '1484641160394702958'
};

const adsStorage = new Map();
const warnStorage = new Map();
const pendingUpdates = new Map(); // لتخزين طلبات التعديل المؤقتة بانتظار الباسورد
const ADMIN_PASSWORD = "Pro@Robot510";
let extraServerInfo = "No recent updates.";

// --- Professional Radar System (Audit Log Monitoring) ---
async function sendDetailedLog(guild, title, details, color = '#3498db') {
    const logChannel = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
    if (!logChannel) return;

    // تأخير بسيط لضمان تسجيل العملية في الـ Audit Log
    setTimeout(async () => {
        const fetchedLogs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
        const logEntry = fetchedLogs?.entries.first();
        const executor = logEntry ? logEntry.executor.tag : "System / Unknown";

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

// --- Automod (Bad Words) ---
const BAD_WORDS = ['word1', 'word2', 'word3']; 

// --- Mistral AI Function ---
async function getMistralResponse(userMessage, guild) {
    const totalMembers = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(m => m.presence?.status === 'online').size;
    const allChannels = guild.channels.cache.map(c => `${c.name} (${c.type === ChannelType.GuildText ? 'Text' : 'Voice'})`).join(', ');

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
                    { role: "system", content: `You are "Pro Robot", the elite professional AI assistant and server observer.
                    - Current Extra Info: ${extraServerInfo}.
                    - Server: "Pro Server for MC".
                    - Owner: Saif (<@${CONFIG.OWNER_ID}>).
                    - Monitoring Mode: You see everything. Total Members: ${totalMembers}, Online: ${onlineMembers}.
                    - Task: If a user wants to change server info or update settings, tell them: "Please provide the admin password to verify you are the owner."
                    - Support ALL languages.` },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.5
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || `Ask the owner! <@${CONFIG.OWNER_ID}>`;
    } catch (err) {
        return `Ask the owner! <@${CONFIG.OWNER_ID}>`;
    }
}

// --- Command Registration ---
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Bot latency speed'),
    new SlashCommandBuilder().setName('clear').setDescription('Clear the chat').addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
    new SlashCommandBuilder().setName('send').setDescription('Send a custom message with specific time').addStringOption(o => o.setName('message').setDescription('Message content').setRequired(true)).addStringOption(o => o.setName('style').setDescription('Message style').setRequired(true).addChoices({name:'Box (Embed)',value:'embed'},{name:'Normal',value:'normal'})).addIntegerOption(o => o.setName('delay_send').setDescription('Wait time before sending (minutes)').setRequired(true)).addIntegerOption(o => o.setName('delete_after').setDescription('Auto-delete time (minutes)').setRequired(true)).addStringOption(o => o.setName('color').setDescription('Box color').addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'},{name:'Green',value:'#2ecc71'})),
    new SlashCommandBuilder().setName('ads_set').setDescription('Setup a new auto-ad').addStringOption(o => o.setName('name').setDescription('Ad name').setRequired(true)).addStringOption(o => o.setName('text').setDescription('Ad content').setRequired(true)).addChannelOption(o => o.setName('channel').setDescription('Ad channel').addChannelTypes(ChannelType.GuildText).setRequired(true)).addIntegerOption(o => o.setName('interval').setDescription('Send every X minutes').setRequired(true)).addIntegerOption(o => o.setName('delete').setDescription('Delete after X minutes').setRequired(true)).addStringOption(o => o.setName('style').setDescription('Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),
    new SlashCommandBuilder().setName('ads_edit').setDescription('Edit or delete an existing ad').addStringOption(o => o.setName('name').setDescription('Choose ad name').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('text').setDescription('New text (optional)').setRequired(false)).addChannelOption(o => o.setName('channel').setDescription('New channel (optional)').addChannelTypes(ChannelType.GuildText).setRequired(false)).addIntegerOption(o => o.setName('interval').setDescription('New interval (optional)').setRequired(false)).addIntegerOption(o => o.setName('delete').setDescription('New delete time (optional)').setRequired(false)).addStringOption(o => o.setName('style').setDescription('New style (optional)').setRequired(false).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),
    new SlashCommandBuilder().setName('translate').setDescription('Translate text').addStringOption(o => o.setName('text').setDescription('The text').setRequired(true)).addStringOption(o => o.setName('to').setDescription('Language code (e.g: ar)').setRequired(true)),
    new SlashCommandBuilder().setName('vote').setDescription('Make a quick vote').addStringOption(o => o.setName('question').setDescription('Vote question').setRequired(true)),
    new SlashCommandBuilder().setName('role').setDescription('Select a member and a rank').addUserOption(o => o.setName('user').setDescription('The member to give the rank to').setRequired(true)).addRoleOption(o => o.setName('rank').setDescription('The rank to give').setRequired(true)),
].map(c => c.toJSON());

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

// --- Monitoring Events (Radar) ---

client.on('guildUpdate', (oldGuild, newGuild) => {
    if (oldGuild.name !== newGuild.name) sendDetailedLog(newGuild, 'Server Name Changed', `From **${oldGuild.name}** to **${newGuild.name}**`, '#e67e22');
    if (oldGuild.icon !== newGuild.icon) sendDetailedLog(newGuild, 'Server Icon Changed', `The server avatar has been updated.`, '#9b59b6');
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
        sendDetailedLog(newMember.guild, 'Nickname Changed', `User: <@${newMember.id}>\nOld: \`${oldMember.nickname || 'None'}\`\nNew: \`${newMember.nickname || 'Original'}\``);
    }
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (addedRoles.size > 0) sendDetailedLog(newMember.guild, 'Role Added', `Role <@&${addedRoles.first().id}> added to <@${newMember.id}>`, '#2ecc71');
    if (removedRoles.size > 0) sendDetailedLog(newMember.guild, 'Role Removed', `Role <@&${removedRoles.first().id}> removed from <@${newMember.id}>`, '#e74c3c');
});

client.on('channelCreate', (ch) => sendDetailedLog(ch.guild, 'Channel Created', `Name: **${ch.name}**\nType: \`${ch.type}\``, '#2ecc71'));
client.on('channelDelete', (ch) => sendDetailedLog(ch.guild, 'Channel Deleted', `Name: **${ch.name}**`, '#e74c3c'));
client.on('roleCreate', (role) => sendDetailedLog(role.guild, 'New Role Created', `Name: **${role.name}**`, '#2ecc71'));
client.on('roleDelete', (role) => sendDetailedLog(role.guild, 'Role Deleted', `Name: **${role.name}**`, '#e74c3c'));
client.on('guildBanAdd', (ban) => sendDetailedLog(ban.guild, 'Member Banned', `User: **${ban.user.tag}** was banned.`, '#c0392b'));

client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
    console.log(`Logged in as ${client.user.tag}`);
    updateLiveInfo();
});

// Chat handling
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // --- Password Check for Pending Updates ---
    if (pendingUpdates.has(message.author.id)) {
        if (message.content === ADMIN_PASSWORD) {
            extraServerInfo = pendingUpdates.get(message.author.id);
            pendingUpdates.delete(message.author.id);
            await message.reply("✅ Password Correct! Server information updated successfully.");
            return updateLiveInfo(message.guild);
        } else {
            pendingUpdates.delete(message.author.id); // ارفع الطلب لو الباسورد غلط عشان ما يعلقش
            return await message.reply("❌ Wrong password. Request cancelled.");
        }
    }

    // --- Automod ---
    const hasBadWord = BAD_WORDS.some(word => message.content.toLowerCase().includes(word));
    if (hasBadWord) {
        await message.delete().catch(() => {});
        let count = (warnStorage.get(message.author.id) || 0) + 1;
        warnStorage.set(message.author.id, count);
        if (count === 1) {
            await message.member.timeout(5 * 60 * 1000, 'Swearing').catch(() => {});
            const m = await message.channel.send(`⚠️ <@${message.author.id}>, muted for 5m (swearing).`);
            setTimeout(() => m.delete().catch(() => {}), 10000);
        } else {
            await message.member.ban({ reason: 'Repeated swearing' }).catch(() => {});
        }
        return;
    }

    const isHelpChannel = message.channel.id === CONFIG.HELP_CH;
    const isMentioned = message.mentions.users.has(client.user.id) && !message.mentions.everyone;

    if (isHelpChannel || isMentioned) {
        try {
            await message.channel.sendTyping();
            const cleanContent = message.content.replace(`<@${client.user.id}>`, '').trim();
            
            // تحويل الطلب لـ AI
            const reply = await getMistralResponse(cleanContent || message.content, message.guild);
            
            if (reply) {
                await message.reply(reply);
                // إذا كان الرد يحتوي على طلب الباسورد، خزن المعلومة الجديدة مؤقتاً
                if (reply.toLowerCase().includes("password") && (cleanContent.toLowerCase().includes("update") || cleanContent.toLowerCase().includes("change"))) {
                    pendingUpdates.set(message.author.id, cleanContent);
                }
            }
        } catch (e) { console.error(e); }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'open_rank_modal') {
        const modal = new ModalBuilder().setCustomId('rank_modal').setTitle('Rank Request');
        const userField = new TextInputBuilder().setCustomId('xbox_user').setLabel("Username").setStyle(TextInputStyle.Short).setRequired(true);
        const rankField = new TextInputBuilder().setCustomId('rank_type').setLabel("Rank you want").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(userField), new ActionRowBuilder().addComponents(rankField));
        return await interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'rank_modal') {
        const xbox = interaction.fields.getTextInputValue('xbox_user');
        const rank = interaction.fields.getTextInputValue('rank_type');
        const logCh = client.channels.cache.get(CONFIG.SUBMIT_LOG);
        if (logCh) await logCh.send(`🔔 New Rank Request: **${xbox}** | Rank: **${rank}** by <@${interaction.user.id}>`);
        return await interaction.reply({ content: "✅ Submitted!", ephemeral: true });
    }
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, channel } = interaction;
        if (commandName === 'ping') return await interaction.reply(`🏓 Speed: \`${client.ws.ping}ms\``);
        if (commandName === 'clear') {
            await interaction.deferReply({ ephemeral: true });
            await channel.bulkDelete(Math.min(options.getInteger('amount'), 100)).catch(() => {});
            return await interaction.editReply('Done! 🧹');
        }
    }
});

// Welcome system
client.on('guildMemberAdd', async (member) => {
    sendDetailedLog(member.guild, 'New Member Joined', `User: <@${member.id}> joined.`, '#2ecc71');
    await member.roles.add([CONFIG.AUTO_ROLE, CONFIG.AUTO_ROLE_2]).catch(() => {});
    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeEmbed = new EmbedBuilder().setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n- Joined the Pro Team!`).setColor('#3498db');
        await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] });
    }
    updateLiveInfo(member.guild);
});

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;
    const infoEmbed = new EmbedBuilder().setTitle("📊 Pro Server Status")
        .setDescription(`
• Owner: <@${CONFIG.OWNER_ID}>
• Members: ${guild.memberCount}
• Location: Egypt
• **Latest Update:** ${extraServerInfo}
        `).setColor('#3498db').setTimestamp();
    const msgs = await infoCh.messages.fetch({ limit: 5 }).catch(() => null);
    if (msgs) msgs.filter(m => m.author.id === client.user.id).forEach(m => m.delete().catch(() => {}));
    await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
}

client.login(process.env.TOKEN);

const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
    ModalBuilder, TextInputBuilder, TextInputStyle, AuditLogEvent 
} = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

// ============================================================
// --- ✅ [DATABASE] MongoDB Connection & Schema ---
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
    if (!data) {
        data = await ServerModel.create({ guildId });
    }
    return data;
}

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
    presence: {
        status: 'online',
        activities: [{
            name: 'Custom Status',
            state: 'Version: 2.2',
            type: 4
        }]
    }
});

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

const pendingUpdates = new Map(); 
const ADMIN_PASSWORD = "Pro@Robot510";
let extraServerInfo = ""; 

// ============================================================
// --- ✅ [1] AI Global Brain & Memory System ---
// ============================================================
const chatMemory = new Map();

async function getEliteAIResponse(userId, userMessage, guild) {
    const memberCount = guild.memberCount;
    const serverName = guild.name;
    const owner = guild.members.cache.get(CONFIG.OWNER_ID)?.user.username || "Saif";

    if (!chatMemory.has(userId)) {
        chatMemory.set(userId, []);
    }
    let memory = chatMemory.get(userId);

    const systemInstruction = {
        role: "system",
        content: `You are "Pro Robot", the autonomous Human-like Executive Manager of the Discord server "${serverName}".
        - You are highly intelligent, observant, and act as if you own the server alongside ${owner}.
        - Current Server Status: ${memberCount} members are currently under your supervision.
        - Owner: ${owner} (<@${CONFIG.OWNER_ID}>).
        - Current Location: Egypt.
        - IDENTITY: You are not a simple bot; you are a sophisticated AI protector. 
        - LANGUAGES: You are a polyglot. You MUST understand and respond fluently in ALL world languages (Arabic, English, etc.) based on the user's language.
        - MEMORY: You remember previous parts of this conversation. Use the provided history to give continuous, smart answers.
        - TONE: Professional, helpful, and authoritative.
        - Special Task: If the user asks to change, add, or update any server info, you MUST respond with: "To process this update, please click the button below to provide the admin password."`
    };

    memory.push({ role: "user", content: userMessage });

    if (memory.length > 10) {
        memory.splice(0, 2); 
    }

    try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MISTRAL_KEY}`
            },
            body: JSON.stringify({
                model: "mistral-medium",
                messages: [systemInstruction, ...memory],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        const data = await response.json();
        const aiReply = data.choices?.[0]?.message?.content || `I am currently analyzing server data. Please repeat your question. <@${CONFIG.OWNER_ID}>`;

        memory.push({ role: "assistant", content: aiReply });
        chatMemory.set(userId, memory);

        return aiReply;

    } catch (error) {
        console.error("AI System Error:", error);
        return `My connection to the main frame was interrupted. Try again! <@${CONFIG.OWNER_ID}>`;
    }
}

async function sendDetailedLog(guild, title, details, color = '#3498db') {
    const logChannel = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
    if (!logChannel) return;

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

const BAD_WORDS = ['word1', 'word2', 'word3']; 

// ============================================================
// --- ✅ [2] Legendary Anti-Link & Security System ---
// ============================================================
const inviteLinkRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/.+[a-z]/gi;
const generalLinkRegex = /(https?:\/\/[^\s]+)/gi;

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
    new SlashCommandBuilder().setName('slash_control').setDescription('Restrict a command to a specific role').addStringOption(o => o.setName('command_name').setDescription('The command to restrict').setRequired(true)).addRoleOption(o => o.setName('allowed_role').setDescription('The role allowed to use this command').setRequired(true)),
    // ✅ [NEW] Reaction Command
    new SlashCommandBuilder()
        .setName('reaction')
        .setDescription('Add a reaction to a specific message using its link')
        .addStringOption(o => o.setName('link').setDescription('The message link').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('The emoji to react with').setRequired(true)),
    // ✅ [NEW] Picture Command
    new SlashCommandBuilder()
        .setName('picture')
        .setDescription('Send pictures with auto-send and auto-delete timers')
        .addAttachmentOption(o => o.setName('image').setDescription('The main image to send').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Message style').setRequired(true).addChoices({name:'Box (Embed)',value:'embed'},{name:'Normal',value:'normal'}))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Wait time before sending (minutes)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Auto-delete time (minutes)').setRequired(true))
        .addStringOption(o => o.setName('caption').setDescription('Add a text description with the image').setRequired(false)),
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

// --- Monitoring Events ---
client.on('guildUpdate', (oldGuild, newGuild) => {
    if (oldGuild.name !== newGuild.name) sendDetailedLog(newGuild, 'Server Name Changed', `From **${oldGuild.name}** to **${newGuild.name}**`, '#e67e22');
    if (oldGuild.icon !== newGuild.icon) sendDetailedLog(newGuild, 'Server Icon Changed', `Server avatar has been updated.`, '#9b59b6');
});

// ✅ [NEW] guildMemberUpdate - Boost System + Original Code
client.on('guildMemberUpdate', async (oldMember, newMember) => {

    // --- [SERVER BOOST SYSTEM] ---
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const BOOST_ROLE_ID = '1496789784524357703';
        const BOOST_CHANNEL_ID = '1482934834899714048';

        try {
            await newMember.roles.add(BOOST_ROLE_ID);
        } catch (err) {
            console.error("Failed to assign boost role:", err);
        }

        const boostChannel = newMember.guild.channels.cache.get(BOOST_CHANNEL_ID);
        if (boostChannel) {
            const boostMsg = await boostChannel.send({
                content: `@everyone\n<@${newMember.id}> Boosted the server! 🎉\n- Now <@${newMember.id}> have <@&${BOOST_ROLE_ID}> rank!`
            });
            if (boostMsg) await boostMsg.react('🎉').catch(() => {});
        }

        sendDetailedLog(
            newMember.guild, 
            'Server Boosted! 💎', 
            `User: <@${newMember.id}> has just boosted the server.\nStatus: **Role Assigned Successfully**`, 
            '#ffff55' 
        );
    }

    // --- Original Code ---
    if (oldMember.nickname !== newMember.nickname) {
        sendDetailedLog(newMember.guild, 'Nickname Changed', `User: <@${newMember.id}>\nOld: \`${oldMember.nickname || 'None'}\`\nNew: \`${newMember.nickname || 'Original'}\``);
    }
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (addedRoles.size > 0) sendDetailedLog(newMember.guild, 'Role Added', `Role <@&${addedRoles.first().id}> added to <@${newMember.id}>`, '#2ecc71');
    if (removedRoles.size > 0) sendDetailedLog(newMember.guild, 'Role Removed', `Role <@&${removedRoles.first().id}> removed from <@${newMember.id}>`, '#e74c3c');
});

client.on('channelCreate', (ch) => sendDetailedLog(ch.guild, 'Channel Created', `Name: **${ch.name}** (Type: ${ch.type})`, '#2ecc71'));
client.on('channelDelete', (ch) => sendDetailedLog(ch.guild, 'Channel Deleted', `Name: **${ch.name}**`, '#e74c3c'));
client.on('roleCreate', (role) => sendDetailedLog(role.guild, 'Role Created', `Role: **${role.name}**`, '#2ecc71'));
client.on('roleDelete', (role) => sendDetailedLog(role.guild, 'Role Deleted', `Role: **${role.name}**`, '#e74c3c'));
client.on('guildBanAdd', (ban) => sendDetailedLog(ban.guild, 'Member Banned', `User: **${ban.user.tag}** was banned.`, '#c0392b'));

// ============================================================
// --- ✅ [3] The Observer System (Voice & Message Activity) ---
// ============================================================
client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member;
    const guild = newState.guild;

    if (!oldState.channelId && newState.channelId) {
        const channel = guild.channels.cache.get(newState.channelId);
        sendDetailedLog(guild, 'Voice Join', 
            `👤 <@${member.id}> joined voice channel: **${channel.name}**`, '#2ecc71');
    }

    if (oldState.channelId && !newState.channelId) {
        const channel = guild.channels.cache.get(oldState.channelId);
        sendDetailedLog(guild, 'Voice Leave', 
            `👤 <@${member.id}> left voice channel: **${channel.name}**`, '#e74c3c');
    }

    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const oldChannel = guild.channels.cache.get(oldState.channelId);
        const newChannel = guild.channels.cache.get(newState.channelId);
        sendDetailedLog(guild, 'Voice Move', 
            `👤 <@${member.id}> moved from **${oldChannel.name}** to **${newChannel.name}**`, '#f1c40f');
    }

    if (!oldState.selfDeaf && newState.selfDeaf) {
        sendDetailedLog(guild, 'Member Deafen', `<@${member.id}> turned on **Server Deafen**.`, '#95a5a6');
    }
});

client.on('messageDelete', (message) => {
    if (message.author?.bot) return;
    sendDetailedLog(message.guild, 'Message Deleted', 
        `🗑️ Message by <@${message.author.id}> deleted in <#${message.channel.id}>:\n**Content:** ${message.content || "Empty/Image"}`, '#e74c3c');
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (oldMessage.author?.bot || oldMessage.content === newMessage.content) return;
    sendDetailedLog(oldMessage.guild, 'Message Edited', 
        `📝 <@${oldMessage.author.id}> edited message in <#${oldMessage.channel.id}>:\n**Old:** ${oldMessage.content}\n**New:** ${newMessage.content}`, '#3498db');
});

client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
    console.log(`Logged in as ${client.user.tag}`);
    updateLiveInfo();
});

// ============================================================
// --- Main messageCreate (Automod + Anti-Link + AI Brain) ---
// ============================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const content = message.content.toLowerCase();

        inviteLinkRegex.lastIndex = 0;
        generalLinkRegex.lastIndex = 0;

        const hasInvite = inviteLinkRegex.test(content);
        const hasLink = generalLinkRegex.test(content);
        const bypassAttempt = content.includes('discord . gg') || content.includes('dot com') || content.includes('. gg/');

        if (hasInvite || bypassAttempt || hasLink) {
            await message.delete().catch(() => {});

            let warns = (warnStorage.get(message.author.id) || 0) + 1;
            warnStorage.set(message.author.id, warns);

            if (warns === 1) {
                const warnEmbed = new EmbedBuilder()
                    .setTitle('🚫 Security Violation')
                    .setDescription(`Stop right there <@${message.author.id}>! Advertising or sending unauthorized links is strictly forbidden.`)
                    .setColor('#e74c3c')
                    .setFooter({ text: 'Next violation will result in a timeout.' });
                const m = await message.channel.send({ embeds: [warnEmbed] });
                setTimeout(() => m.delete().catch(() => {}), 10000);

            } else if (warns === 2) {
                await message.member.timeout(60 * 60 * 1000, 'Sending links/Advertising').catch(() => {});
                message.channel.send(`🤐 <@${message.author.id}> has been muted for 1 hour for repeated link violations.`);

            } else {
                await message.member.ban({ reason: 'Persistent Advertising & Security Breach' }).catch(() => {});
                message.channel.send(`🚫 <@${message.author.id}> has been permanently banned for extreme advertising.`);
                sendDetailedLog(message.guild, 'User Banned (Anti-Link)', `User: **${message.author.tag}** was banned for trying to bypass link security.`, '#c0392b');
            }
            return;
        }
    }

    const hasBadWord = BAD_WORDS.some(word => message.content.toLowerCase().includes(word));
    if (hasBadWord) {
        await message.delete().catch(() => {});
        let count = (warnStorage.get(message.author.id) || 0) + 1;
        warnStorage.set(message.author.id, count);
        if (count === 1) {
            await message.member.timeout(5 * 60 * 1000, 'Swearing in server').catch(() => {});
            const m = await message.channel.send(`⚠️ <@${message.author.id}>, you have been muted for 5 minutes for swearing.`);
            setTimeout(() => m.delete().catch(() => {}), 10000);
        } else {
            await message.member.ban({ reason: 'Repeated severe swearing' }).catch(() => {});
            message.channel.send(`🚫 <@${message.author.id}> has been permanently banned for repeated swearing.`);
        }
        return;
    }

    const isHelpChannel = message.channel.id === CONFIG.HELP_CH;
    const isMentioned = message.mentions.users.has(client.user.id) && !message.mentions.everyone;

    if (isHelpChannel || isMentioned) {
        try {
            await message.channel.sendTyping();
            const cleanContent = message.content.replace(`<@${client.user.id}>`, '').replace(`<@!${client.user.id}>`, '').trim();

            const text = await getEliteAIResponse(message.author.id, cleanContent || message.content, message.guild);
            
            if (text) {
                const isUpdateTask = cleanContent.includes("تعديل") || cleanContent.includes("update") || cleanContent.includes("ضيف");

                if (isUpdateTask) {
                    pendingUpdates.set(message.author.id, cleanContent);
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('open_admin_modal').setLabel('Enter Password 🔐').setStyle(ButtonStyle.Danger)
                    );
                    const botMsg = await message.reply({ content: text, components: [row] });
                    if (isHelpChannel) setTimeout(() => { message.delete().catch(() => {}); botMsg.delete().catch(() => {}); }, 300000);
                } else {
                    const botMsg = await message.reply(text);
                    if (isHelpChannel) setTimeout(() => { message.delete().catch(() => {}); botMsg.delete().catch(() => {}); }, 300000);
                }
            }

            const rankKeywords = ['rank', 'role', 'رتبة', 'رتبه', 'رتب'];
            if (rankKeywords.some(key => message.content.toLowerCase().includes(key))) {
                const embed = new EmbedBuilder().setDescription("Submit to write your username on Xbox to get rank you want it. By @pro_king510").setColor('#3498db');
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_rank_modal').setLabel('Submit').setStyle(ButtonStyle.Primary));
                const sentModalMsg = await message.channel.send({ embeds: [embed], components: [row] });
                if (isHelpChannel) setTimeout(() => sentModalMsg.delete().catch(() => {}), 300000);
            }
        } catch (e) { console.error(e); }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId === 'open_rank_modal') {
        const modal = new ModalBuilder().setCustomId('rank_modal').setTitle('Rank Request');
        const userField = new TextInputBuilder().setCustomId('xbox_user').setLabel("Username").setStyle(TextInputStyle.Short).setPlaceholder("Write your Xbox username").setRequired(true);
        const rankField = new TextInputBuilder().setCustomId('rank_type').setLabel("Rank you want").setStyle(TextInputStyle.Short).setPlaceholder("Write the rank name").setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(userField), new ActionRowBuilder().addComponents(rankField));
        return await interaction.showModal(modal);
    }

    if (interaction.isButton() && interaction.customId === 'open_admin_modal') {
        const modal = new ModalBuilder().setCustomId('admin_pass_modal').setTitle('Admin Verification');
        const passField = new TextInputBuilder().setCustomId('admin_password_input').setLabel("Admin Password").setStyle(TextInputStyle.Short).setPlaceholder("Enter Pro Robot Password").setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(passField));
        return await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'rank_modal') {
        const xbox = interaction.fields.getTextInputValue('xbox_user');
        const rank = interaction.fields.getTextInputValue('rank_type');
        const logCh = client.channels.cache.get(CONFIG.SUBMIT_LOG);
        if (logCh) await logCh.send(`🔔 New Rank Request from <@${interaction.user.id}>:\n**Username:** ${xbox}\n**Rank:** ${rank}`);
        return await interaction.reply({ content: "✅ Your request has been submitted to the owner!", ephemeral: true });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'admin_pass_modal') {
        const enteredPass = interaction.fields.getTextInputValue('admin_password_input');
        if (enteredPass === ADMIN_PASSWORD) {
            extraServerInfo = pendingUpdates.get(interaction.user.id) || "Updated via AI";
            pendingUpdates.delete(interaction.user.id);
            await updateLiveInfo(interaction.guild);
            return await interaction.reply({ content: "✅ **Password Correct!** Information has been updated on the Live Info board.", ephemeral: true });
        } else {
            pendingUpdates.delete(interaction.user.id);
            return await interaction.reply({ content: "❌ **Incorrect Password.** Action cancelled.", ephemeral: true });
        }
    }

    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const choices = Array.from(adsStorage.keys());
        const filtered = choices.filter(choice => choice.startsWith(focusedValue));
        await interaction.respond(filtered.map(c => ({ name: c, value: c }))).catch(() => {});
    }

    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, channel } = interaction;
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
            const dbData = await getDB(interaction.guild.id);
            const allowedRoleId = dbData.cmdPermissions.get(commandName);

            if (allowedRoleId && 
                !interaction.member.roles.cache.has(allowedRoleId) && 
                !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                
                return await interaction.editReply({ 
                    content: `❌ Access Denied! This command requires the <@&${allowedRoleId}> role.`
                });
            }

            if (commandName === 'ping') return await interaction.editReply(`🏓 Pong! Speed: \`${client.ws.ping}ms\``);

            if (commandName === 'role') {
                const targetUser = options.getMember('user');
                const targetRole = options.getRole('rank');
                const roleChan = guild.channels.cache.get(CONFIG.ROLE_CHANNEL);
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return await interaction.editReply({ content: "❌ You don't have permission!" });
                await targetUser.roles.add(targetRole).catch(e => console.error(e));
                const roleEmbed = new EmbedBuilder().setTitle('✨ New Rank Given').setDescription(`**Member:** <@${targetUser.id}>\n**Rank:** <@&${targetRole.id}>\n**By:** <@${interaction.user.id}>`).setColor('#3498db').setTimestamp();
                if (roleChan) await roleChan.send({ embeds: [roleEmbed] });
                return await interaction.editReply({ content: `✅ Successfully gave **${targetRole.name}** to **${targetUser.user.username}**.` });
            }

            if (commandName === 'send') {
                const msg = options.getString('message');
                const style = options.getString('style');
                const delay = options.getInteger('delay_send');
                const delAfter = options.getInteger('delete_after');
                const color = options.getString('color') || '#3498db';
                await interaction.editReply({ content: `✅ The message will be sent in ${delay} minute(s).` });
                setTimeout(async () => {
                    let sent;
                    if (style === 'embed') { sent = await channel.send({ embeds: [new EmbedBuilder().setDescription(msg).setColor(color)] }).catch(() => {}); }
                    else { sent = await channel.send(msg).catch(() => {}); }
                    if (sent && delAfter > 0) setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
                }, delay * 60000);
            }

            if (commandName === 'ads_set') {
                const name = options.getString('name');
                const data = { name, text: options.getString('text'), channelId: options.getChannel('channel').id, interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'), style: options.getString('style'), timer: null, lastMsgId: null };
                adsStorage.set(name, data);
                startAdLoop(name, guild.id);
                return await interaction.editReply({ content: `✅ Ad activated: **${name}**` });
            }

            if (commandName === 'ads_edit') {
                const name = options.getString('name');
                const ad = adsStorage.get(name);
                if (!ad) return await interaction.editReply({ content: "❌ Not found." });
                if (options.getString('text')) ad.text = options.getString('text');
                if (options.getChannel('channel')) ad.channelId = options.getChannel('channel').id;
                if (options.getInteger('interval')) ad.interval = options.getInteger('interval');
                if (options.getInteger('delete') !== null) ad.deleteAfter = options.getInteger('delete');
                if (options.getString('style')) ad.style = options.getString('style');
                startAdLoop(name, guild.id);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stop_ad_${name}`).setLabel('Delete ad 🗑️').setStyle(ButtonStyle.Danger));
                return await interaction.editReply({ content: `⚙️ Ad **${name}** updated.`, components: [row] });
            }

            if (commandName === 'clear') {
                await channel.bulkDelete(Math.min(options.getInteger('amount'), 100)).catch(() => {});
                return await interaction.editReply('Chat cleaned! 🧹');
            }

            if (commandName === 'translate') {
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${options.getString('to').toLowerCase()}&dt=t&q=${encodeURI(options.getString('text'))}`);
                const json = await res.json();
                return await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🌐 Translation').setDescription(json[0].map(i => i[0]).join('')).setColor('#4285F4')] });
            }

            if (commandName === 'vote') {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success), 
                    new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger)
                );
                return await interaction.editReply({ 
                    embeds: [new EmbedBuilder().setTitle('New Vote').setDescription(options.getString('question')).setColor('#f1c40f')], 
                    components: [row] 
                });
            }

            if (commandName === 'slash_control') {
                const targetCmd = options.getString('command_name');
                const role = options.getRole('allowed_role');
                dbData.cmdPermissions.set(targetCmd, role.id);
                await dbData.save(); 
                return await interaction.editReply({ 
                    content: `✅ Settings updated! The command \`/${targetCmd}\` is now restricted to <@&${role.id}>.`
                });
            }

            // ✅ [NEW] Reaction Command Handler
            if (commandName === 'reaction') {
                const link = options.getString('link');
                const emoji = options.getString('emoji');

                const linkParts = link.split('/');
                const channelId = linkParts[linkParts.length - 2];
                const messageId = linkParts[linkParts.length - 1];

                try {
                    const targetChannel = await guild.channels.fetch(channelId);
                    if (!targetChannel) return await interaction.editReply("❌ Channel not found.");

                    const targetMsg = await targetChannel.messages.fetch(messageId);
                    if (!targetMsg) return await interaction.editReply("❌ Message not found.");

                    await targetMsg.react(emoji);
                    return await interaction.editReply({ content: `✅ Successfully reacted with ${emoji} to the message!` });

                } catch (error) {
                    console.error(error);
                    return await interaction.editReply({ content: "❌ Failed to add reaction. Make sure the link and emoji are valid." });
                }
            }

            // ✅ [NEW] Picture Command Handler
            if (commandName === 'picture') {
                const image = options.getAttachment('image');
                const style = options.getString('style');
                const delay = options.getInteger('delay_send');
                const delAfter = options.getInteger('delete_after');
                const caption = options.getString('caption') || "";

                await interaction.editReply({ content: `✅ Picture scheduled! Will be sent in ${delay} min and deleted after ${delAfter} min.` });

                setTimeout(async () => {
                    let sent;
                    if (style === 'embed') {
                        const embed = new EmbedBuilder()
                            .setDescription(caption)
                            .setImage(image.url)
                            .setColor('#3498db')
                            .setTimestamp();
                        sent = await channel.send({ embeds: [embed] }).catch(() => {});
                    } else {
                        sent = await channel.send({ content: caption, files: [image.url] }).catch(() => {});
                    }

                    if (sent && delAfter > 0) {
                        setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
                    }
                }, delay * 60000);
            }

        } catch (e) { 
            console.error("❌ Command Error:", e);
            if (interaction.deferred) await interaction.editReply("❌ An error occurred.").catch(() => {});
        }
    } 
    else if (interaction.isButton() && interaction.customId.startsWith('stop_ad_')) {
        const name = interaction.customId.replace('stop_ad_', '');
        const ad = adsStorage.get(name);
        if (ad) { if (ad.timer) clearInterval(ad.timer); adsStorage.delete(name); await interaction.update({ content: `🗑️ Ad **${name}** removed.`, components: [], ephemeral: true }); }
    }
});

client.on('guildMemberAdd', async (member) => {
    sendDetailedLog(member.guild, 'New Member Joined', `Member: <@${member.id}> has joined the server.`, '#2ecc71');
    const rolesToAdd = [CONFIG.AUTO_ROLE, CONFIG.AUTO_ROLE_2];
    await member.roles.add(rolesToAdd).catch(() => {});
    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeEmbed = new EmbedBuilder().setDescription(`## 𝗪𝗲𝗹𝗰𝗼𝗺𝗲!\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read rules server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1482901664951304222>\n[¡}================{!}================[¡}\nThank you! ❤️`).setColor('#3498db');
        const m = await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] }).catch(() => {});
        if (m) setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

client.on('guildMemberRemove', async (member) => {
    sendDetailedLog(member.guild, 'Member Left', `User: **${member.user.tag}** left the server.`, '#e74c3c');
    updateLiveInfo(member.guild);
});

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;
    const infoEmbed = new EmbedBuilder()
        .setTitle("📊 Pro Server Live Status")
        .setDescription(`[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@${CONFIG.OWNER_ID}>\n• Robot: <@${CONFIG.BOT_ID}>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: ${guild.memberCount}\n• **Latest Update:** ${extraServerInfo || "No recent updates."}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`)
        .setColor('#3498db').setFooter({ text: "Last Radar Update" }).setTimestamp();
    try {
        const msgs = await infoCh.messages.fetch({ limit: 10 }).catch(() => null);
        if (msgs) { msgs.filter(m => m.author.id === client.user.id).forEach(async m => await m.delete().catch(() => {})); }
        await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
    } catch (e) { console.error(e); }
}

client.login(process.env.TOKEN);

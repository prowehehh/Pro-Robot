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

// --- Audit Log Monitoring System ---
async function sendDetailedLog(guild, title, details, color = '#3498db') {
    const logChannel = guild.channels.cache.get(CONFIG.SUBMIT_LOG);
    if (!logChannel) return;

    const fetchedLogs = await guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
    const logEntry = fetchedLogs?.entries.first();
    const executor = logEntry ? logEntry.executor.tag : "System / Unknown";

    const logEmbed = new EmbedBuilder()
        .setTitle(`🛠️ Server Update: ${title}`)
        .setDescription(details)
        .addFields(
            { name: '👤 Executor:', value: `**${executor}**`, inline: true },
            { name: '📍 Location:', value: guild.name, inline: true }
        )
        .setColor(color)
        .setTimestamp();

    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
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
                    - Server Name: "Pro Server for MC".
                    - Owner: Saif (<@${CONFIG.OWNER_ID}>).
                    - Current Location: Egypt.
                    - Date Server Created: 15/03/2026.
                    - Monitoring Mode: You see everything. Total Members: ${totalMembers}, Online: ${onlineMembers}.
                    - Channels list: [${allChannels}].
                    - Task: Monitor interactions and provide info about the server precisely.
                    - Support ALL languages. Respond in the same language as the user.` },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.5
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || `I don't know, you have to ask owner! <@${CONFIG.OWNER_ID}>`;
    } catch (err) {
        return `I don't know, ask the owner! <@${CONFIG.OWNER_ID}>`;
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

// --- Monitoring Events ---

client.on('guildUpdate', (oldGuild, newGuild) => {
    if (oldGuild.name !== newGuild.name) {
        sendDetailedLog(newGuild, 'Server Name Changed', `Name changed from **${oldGuild.name}** to **${newGuild.name}**`, '#e67e22');
    }
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
        sendDetailedLog(newMember.guild, 'Nickname Changed', `User: <@${newMember.id}>\nFrom: \`${oldMember.nickname || 'None'}\`\nTo: \`${newMember.nickname || 'Original Name'}\``);
    }
    const oldRoles = oldMember.roles.cache.map(r => r.id);
    const newRoles = newMember.roles.cache.map(r => r.id);
    if (oldRoles.length !== newRoles.length) {
        const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id)).first();
        const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id)).first();
        if (added) sendDetailedLog(newMember.guild, 'Role Added', `Added role <@&${added.id}> to <@${newMember.id}>`, '#2ecc71');
        if (removed) sendDetailedLog(newMember.guild, 'Role Removed', `Removed role <@&${removed.id}> from <@${newMember.id}>`, '#e74c3c');
    }
});

client.on('channelCreate', (channel) => sendDetailedLog(channel.guild, 'Channel Created', `Name: **${channel.name}** (Type: ${channel.type})`, '#2ecc71'));
client.on('channelDelete', (channel) => sendDetailedLog(channel.guild, 'Channel Deleted', `Name: **${channel.name}**`, '#e74c3c'));
client.on('channelUpdate', (oldCh, newCh) => {
    if (oldCh.name !== newCh.name) sendDetailedLog(newCh.guild, 'Channel Renamed', `From: \`${oldCh.name}\`\nTo: \`${newCh.name}\``, '#f1c40f');
});

client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
    console.log(`Logged in as ${client.user.tag}`);
    updateLiveInfo();
});

// Chat handling
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // --- Automod ---
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
            
            const text = await getMistralResponse(cleanContent || message.content, message.guild);
            if (text) {
                const botMsg = await message.reply(text);
                if (isHelpChannel) {
                    setTimeout(() => {
                        message.delete().catch(() => {});
                        botMsg.delete().catch(() => {});
                    }, 300000); 
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
    if (interaction.isModalSubmit() && interaction.customId === 'rank_modal') {
        const xbox = interaction.fields.getTextInputValue('xbox_user');
        const rank = interaction.fields.getTextInputValue('rank_type');
        const logCh = client.channels.cache.get(CONFIG.SUBMIT_LOG);
        if (logCh) await logCh.send(`🔔 New Rank Request from <@${interaction.user.id}>:\n**Username:** ${xbox}\n**Rank:** ${rank}`);
        return await interaction.reply({ content: "✅ Your request has been submitted to the owner!", ephemeral: true });
    }
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const choices = Array.from(adsStorage.keys());
        const filtered = choices.filter(choice => choice.startsWith(focusedValue));
        await interaction.respond(filtered.map(c => ({ name: c, value: c }))).catch(() => {});
    }
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, channel } = interaction;
        try {
            if (commandName === 'ping') return await interaction.reply(`🏓 Pong! Speed: \`${client.ws.ping}ms\``);
            if (commandName === 'role') {
                const targetUser = options.getMember('user');
                const targetRole = options.getRole('rank');
                const roleChan = guild.channels.cache.get(CONFIG.ROLE_CHANNEL);
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return await interaction.reply({ content: "❌ You don't have permission!", ephemeral: true });
                await targetUser.roles.add(targetRole).catch(e => console.error(e));
                const roleEmbed = new EmbedBuilder().setTitle('✨ New Rank Given').setDescription(`**Member:** <@${targetUser.id}>\n**Rank:** <@&${targetRole.id}>\n**By:** <@${interaction.user.id}>`).setColor('#3498db').setTimestamp();
                if (roleChan) await roleChan.send({ embeds: [roleEmbed] });
                return await interaction.reply({ content: `✅ Successfully gave **${targetRole.name}** to **${targetUser.user.username}**.`, ephemeral: true });
            }
            if (commandName === 'send') {
                const msg = options.getString('message');
                const style = options.getString('style');
                const delay = options.getInteger('delay_send');
                const delAfter = options.getInteger('delete_after');
                const color = options.getString('color') || '#3498db';
                await interaction.reply({ content: `✅ The message will be sent in ${delay} minute(s).`, ephemeral: true });
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
                return await interaction.reply({ content: `✅ Ad activated: **${name}**`, ephemeral: true });
            }
            if (commandName === 'ads_edit') {
                const name = options.getString('name');
                const ad = adsStorage.get(name);
                if (!ad) return await interaction.reply({ content: "❌ Not found.", ephemeral: true });
                if (options.getString('text')) ad.text = options.getString('text');
                if (options.getChannel('channel')) ad.channelId = options.getChannel('channel').id;
                if (options.getInteger('interval')) ad.interval = options.getInteger('interval');
                if (options.getInteger('delete') !== null) ad.deleteAfter = options.getInteger('delete');
                if (options.getString('style')) ad.style = options.getString('style');
                startAdLoop(name, guild.id);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stop_ad_${name}`).setLabel('Delete ad 🗑️').setStyle(ButtonStyle.Danger));
                return await interaction.reply({ content: `⚙️ Ad **${name}** updated.`, components: [row], ephemeral: true });
            }
            if (commandName === 'clear') {
                await interaction.deferReply({ ephemeral: true });
                await channel.bulkDelete(Math.min(options.getInteger('amount'), 100)).catch(() => {});
                return await interaction.editReply('Chat cleaned! 🧹');
            }
            if (commandName === 'translate') {
                await interaction.deferReply();
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${options.getString('to').toLowerCase()}&dt=t&q=${encodeURI(options.getString('text'))}`);
                const json = await res.json();
                return await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🌐 Translation').setDescription(json[0].map(i => i[0]).join('')).setColor('#4285F4')] });
            }
            if (commandName === 'vote') {
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger));
                return await interaction.reply({ embeds: [new EmbedBuilder().setTitle('New Vote').setDescription(options.getString('question')).setColor('#f1c40f')], components: [row] });
            }
        } catch (e) { console.error(e); }
    } 
    else if (interaction.isButton() && interaction.customId.startsWith('stop_ad_')) {
        const name = interaction.customId.replace('stop_ad_', '');
        const ad = adsStorage.get(name);
        if (ad) { if (ad.timer) clearInterval(ad.timer); adsStorage.delete(name); await interaction.update({ content: `🗑️ Ad **${name}** removed.`, components: [], ephemeral: true }); }
    }
});

// Welcome system
client.on('guildMemberAdd', async (member) => {
    sendDetailedLog(member.guild, 'New Member Joined', `Member: <@${member.id}> has joined the server.`, '#2ecc71');
    const rolesToAdd = [CONFIG.AUTO_ROLE, CONFIG.AUTO_ROLE_2];
    await member.roles.add(rolesToAdd).catch(e => console.error("Error adding auto roles:", e));

    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeEmbed = new EmbedBuilder().setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read rules server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1482901664951304222>\n[¡}================{!}================[¡}\nThank you! ❤️`).setColor('#3498db');
        const m = await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] }).catch(() => {});
        if (m) setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

// Clear messages on leave
client.on('guildMemberRemove', async (member) => {
    sendDetailedLog(member.guild, 'Member Left', `User: **${member.user.tag}** left the server.`, '#e74c3c');
    const channels = member.guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
    for (const [id, channel] of channels) {
        try {
            const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
            if (!messages) continue;
            const memberMessages = messages.filter(m => m.author.id === member.id);
            if (memberMessages.size > 0) {
                await channel.bulkDelete(memberMessages).catch(() => {
                    memberMessages.forEach(m => m.delete().catch(() => {}));
                });
            }
        } catch (e) { console.error(e); }
    }
    updateLiveInfo(member.guild);
});

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;
    const infoEmbed = new EmbedBuilder().setDescription(`[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@${CONFIG.OWNER_ID}>\n• Robot: <@${CONFIG.BOT_ID}>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`).setColor('#3498db');
    try {
        const msgs = await infoCh.messages.fetch({ limit: 10 }).catch(() => null);
        if (msgs) { msgs.filter(m => m.author.id === client.user.id).forEach(async m => await m.delete().catch(() => {})); }
        await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
    } catch (e) { console.error(e); }
}

client.login(process.env.TOKEN);

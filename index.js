const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const express = require('express');
const app = express();

// --- تشغيل السيرفر لاستضافة البوت ---
app.get('/', (req, res) => res.send('Pro Robot is Online! 🚀'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server is ready on port ${port}!`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- إعدادات الأيدي (IDs) ---
const WELCOME_CHANNEL_ID = '1482881348204101768';
const INFO_CHANNEL_ID = '1484639863411183636';
const MEMBER_ROLE_ID = '1482883802186514615';

// --- مصفوفة الأوامر (كلها بالإنجليزية) ---
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('info').setDescription('Update live server info'),
  new SlashCommandBuilder().setName('server').setDescription('Show server statistics'),
  new SlashCommandBuilder().setName('vote').setDescription('Start a poll').addStringOption(opt => opt.setName('question').setDescription('The question to vote on').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Delete a number of messages').addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a member').addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)).addIntegerOption(opt => opt.setName('duration').setDescription('Minutes').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a member').addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member').addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member').addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)),
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a styled message')
    .addStringOption(opt => opt.setName('message').setDescription('Message content').setRequired(true))
    .addStringOption(opt => opt.setName('style').setDescription('Choose style').setRequired(true).addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal Text', value: 'normal' }))
    .addStringOption(opt => opt.setName('color').setDescription('Box color').addChoices({ name: 'Blue', value: '#3498db' }, { name: 'Green', value: '#2ecc71' }, { name: 'Red', value: '#e74c3c' }))
    .addIntegerOption(opt => opt.setName('time').setDescription('Auto-delete after (minutes)').setRequired(true)),
].map(command => command.toJSON());

// --- تشغيل البوت ورفع الأوامر ---
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { 
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); 
        console.log('Commands Registered Successfully! ✅');
    } catch (e) { console.error(e); }
    updateLiveInfo();
});

// --- التفاعل مع الأوامر ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, channel, member } = interaction;
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (commandName === 'ping') await interaction.reply(`🏓 Latency: \`${client.ws.ping}ms\``);

    if (commandName === 'clear') {
        if (!isAdmin) return interaction.reply({ content: "You don't have permission! ❌", ephemeral: true });
        const amt = options.getInteger('amount');
        await channel.bulkDelete(Math.min(amt, 100)).catch(() => {});
        await interaction.reply({ content: `Successfully deleted ${amt} messages.`, ephemeral: true });
    }

    if (commandName === 'send') {
        const msg = options.getString('message');
        const style = options.getString('style');
        const col = options.getString('color') || '#3498db';
        const time = options.getInteger('time');
        let sent;
        if (style === 'embed') {
            const emb = new EmbedBuilder().setDescription(msg).setColor(col);
            sent = await channel.send({ embeds: [emb] });
        } else {
            sent = await channel.send(msg);
        }
        await interaction.reply({ content: "Message Sent! ✅", ephemeral: true });
        if (time > 0) setTimeout(() => sent.delete().catch(() => {}), time * 60000);
    }

    if (commandName === 'vote') {
        const q = options.getString('question');
        const emb = new EmbedBuilder().setTitle('New Vote!').setDescription(q).setColor('#3498db').setFooter({ text: `By: ${member.user.username}` });
        const m = await interaction.reply({ embeds: [emb], fetchReply: true });
        await m.react('✅'); await m.react('❌');
    }

    if (commandName === 'mute') {
        const target = options.getMember('target');
        const duration = options.getInteger('duration');
        await target.timeout(duration * 60000);
        await interaction.reply(`${target} has been muted for ${duration} minutes. 🔇`);
    }

    if (commandName === 'unmute') {
        const target = options.getMember('target');
        await target.timeout(null);
        await interaction.reply(`${target} has been unmuted. 🔊`);
    }

    if (commandName === 'kick') {
        const target = options.getMember('target');
        await target.kick();
        await interaction.reply(`${target} has been kicked! 🦶`);
    }

    if (commandName === 'ban') {
        const target = options.getUser('target');
        await guild.members.ban(target);
        await interaction.reply(`${target.username} has been banned! 🚫`);
    }

    if (commandName === 'server') {
        const emb = new EmbedBuilder()
            .setTitle(`${guild.name} Statistics`)
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: 'Total Members', value: `${guild.memberCount}`, inline: true },
                { name: 'Server ID', value: `${guild.id}`, inline: true }
            )
            .setColor('#f1c40f');
        await interaction.reply({ embeds: [emb] });
    }

    if (commandName === 'info') {
        updateLiveInfo(guild);
        await interaction.reply('Live info has been updated! 🔄');
    }
});

// --- نظام الترحيب وإعطاء الرتبة التلقائية ---
client.on('guildMemberAdd', async (member) => {
    // إعطاء الرتبة
    try {
        const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
        if (role) await member.roles.add(role);
    } catch(e) { console.log("Role Error"); }

    // إرسال رسالة الترحيب (بدون Thumbnail)
    const welcomeChan = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChan) {
        const emb = new EmbedBuilder()
            .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
            .setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉`)
            .setColor('#00ff00')
            .setFooter({ text: 'Pro King System' });
        await welcomeChan.send({ content: `${member}`, embeds: [emb] });
    }
    updateLiveInfo(member.guild);
});

// --- تحديث معلومات السيرفر المباشرة ---
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const chan = client.channels.cache.get(INFO_CHANNEL_ID);
    if (!chan || !guild) return;
    const content = `**Server Live Info**\n• Members: ${guild.memberCount}\n• Status: Online 🟢`;
    const msgs = await chan.messages.fetch({ limit: 5 });
    const lastMsg = msgs.find(m => m.author.id === client.user.id);
    if (lastMsg) await lastMsg.edit(content); else await chan.send(content);
}

client.login(process.env.TOKEN);
